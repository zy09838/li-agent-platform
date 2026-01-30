#!/usr/bin/env python3
"""
训练服务 API
提供模型训练、状态监控、模型管理等接口

启动方式：
    python train_server.py --port 5001
"""

import argparse
import json
import os
import shutil
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from queue import Queue
from collections import deque
from typing import Dict, Optional
import base64
import io
import zipfile
import tempfile

try:
    import requests
except ImportError:
    requests = None

from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# 配置最大请求体大小（100MB）
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024

# ============== 错误处理 ==============
class APIError(Exception):
    """API错误基类"""
    def __init__(self, message: str, code: int = 400, details: dict = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(self.message)

@app.errorhandler(APIError)
def handle_api_error(error: APIError):
    """统一API错误处理"""
    return jsonify({
        'success': False,
        'error': error.message,
        'code': error.code,
        'details': error.details
    }), error.code

@app.errorhandler(Exception)
def handle_unexpected_error(error: Exception):
    """处理未预期的错误"""
    import traceback
    traceback.print_exc()

    return jsonify({
        'success': False,
        'error': '服务器内部错误',
        'code': 500,
        'details': {'type': type(error).__name__}
    }), 500

def api_response(success: bool = True, data: dict = None, message: str = None, code: int = 200):
    """标准API响应格式"""
    response = {'success': success}
    if data:
        response['data'] = data
    if message:
        response['message'] = message
    return jsonify(response), code

# ============== 全局配置 ==============
BASE_DIR = Path(__file__).parent.absolute()
RUNS_DIR = BASE_DIR / 'runs'
MODELS_REGISTRY_FILE = BASE_DIR / 'models_registry.json'
DATASET_RAW_DIR = BASE_DIR / 'dataset_raw'

# 训练状态管理
training_state = {
    'is_training': False,
    'task_id': None,
    'progress': 0,
    'current_epoch': 0,
    'total_epochs': 0,
    'metrics': {},
    'logs': [],
    'status': 'idle',  # idle, preparing, training, completed, failed, stopped
    'start_time': None,
    'config': {}
}

# 日志队列（用于SSE推送）
log_queue = Queue()

# 训练队列
training_queue = Queue()
training_history = deque(maxlen=50)  # 保留最近50个任务历史
queue_lock = threading.Lock()

# 线程锁
state_lock = threading.Lock()

# 训练进程引用（用于停止训练）
training_thread = None
stop_training_flag = False


# ============== 工具函数 ==============
def load_models_registry() -> Dict:
    """加载模型注册表"""
    if MODELS_REGISTRY_FILE.exists():
        with open(MODELS_REGISTRY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'models': []}


def save_models_registry(registry: Dict):
    """保存模型注册表"""
    with open(MODELS_REGISTRY_FILE, 'w', encoding='utf-8') as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)


def add_log(message: str, level: str = 'info'):
    """添加日志"""
    timestamp = datetime.now().strftime('%H:%M:%S')
    log_entry = {
        'timestamp': timestamp,
        'message': message,
        'level': level
    }
    with state_lock:
        training_state['logs'].append(log_entry)
        # 保留最近500条日志
        if len(training_state['logs']) > 500:
            training_state['logs'] = training_state['logs'][-500:]
    log_queue.put(log_entry)


def update_training_state(**kwargs):
    """更新训练状态"""
    with state_lock:
        training_state.update(kwargs)


def sync_managed_dataset(dataset_id: str, force_full: bool = False) -> Path:
    """智能同步数据集（增量更新）"""
    # 源目录 (dataset_server)
    dataset_server_dir = BASE_DIR / 'datasets' / dataset_id
    if not dataset_server_dir.exists():
        raise FileNotFoundError(f"Dataset {dataset_id} not found")

    # 读取元数据
    source_metadata_path = dataset_server_dir / 'metadata.json'
    with open(source_metadata_path, 'r', encoding='utf-8') as f:
        metadata = json.load(f)

    # 目标目录 (training/training_datasets/ID)
    training_dataset_dir = BASE_DIR / 'training_datasets' / dataset_id
    training_images_dir = training_dataset_dir / 'images'
    training_annotations_dir = training_dataset_dir / 'annotations'
    sync_info_path = training_dataset_dir / '.sync_info.json'

    # 检查是否需要同步
    need_sync = force_full or not sync_info_path.exists()

    if not need_sync:
        # 读取上次同步信息
        try:
            with open(sync_info_path, 'r') as f:
                sync_info = json.load(f)

            # 比较元数据修改时间
            source_mtime = source_metadata_path.stat().st_mtime
            if sync_info.get('source_mtime', 0) >= source_mtime:
                # 数据集未变化，无需同步
                return training_dataset_dir
            need_sync = True
        except:
            need_sync = True

    # 创建目录（如果不存在）
    training_images_dir.mkdir(parents=True, exist_ok=True)
    training_annotations_dir.mkdir(parents=True, exist_ok=True)

    source_images_dir = dataset_server_dir / 'images'
    source_annotations_dir = dataset_server_dir / 'annotations'

    # 增量同步：只处理标注的图片
    synced_files = []
    for image_info in metadata.get('images', []):
        if not image_info.get('isAnnotated', False):
            continue

        image_id = image_info['id']
        stored_filename = image_info.get('storedFilename', f"{image_id}.jpg")

        # 复制图片（检查是否需要更新）
        source_image = source_images_dir / stored_filename
        target_image = training_images_dir / stored_filename

        if source_image.exists():
            # 如果目标文件不存在或源文件更新，则复制
            if not target_image.exists() or source_image.stat().st_mtime > target_image.stat().st_mtime:
                shutil.copy2(source_image, target_image)  # copy2 preserves metadata
                synced_files.append(stored_filename)

        # 转换标注（总是更新，因为很小）
        source_annotation = source_annotations_dir / f"{image_id}.json"
        target_annotation = training_annotations_dir / f"{stored_filename.rsplit('.', 1)[0]}.json"

        if source_annotation.exists():
            with open(source_annotation, 'r', encoding='utf-8') as f:
                annotation_data = json.load(f)

            converted_annotation = {
                'imageName': stored_filename,
                'annotations': annotation_data.get('annotations', []),
                'masks': annotation_data.get('masks', [])
            }

            with open(target_annotation, 'w', encoding='utf-8') as f:
                json.dump(converted_annotation, f, ensure_ascii=False, indent=2)

    # 保存同步信息
    with open(sync_info_path, 'w') as f:
        json.dump({
            'source_mtime': source_metadata_path.stat().st_mtime,
            'synced_at': time.time(),
            'synced_files_count': len(synced_files)
        }, f)

    return training_dataset_dir
class TrainingCallback:
    """YOLO训练回调，用于监控训练进度"""
    
    def __init__(self, total_epochs: int):
        self.total_epochs = total_epochs
        self.current_epoch = 0
    
    def on_train_epoch_end(self, trainer):
        """每个epoch结束时调用"""
        global stop_training_flag
        
        # 检查是否需要停止训练
        if stop_training_flag:
            add_log("检测到停止信号，正在终止训练...", level='warning')
            # 通过抛出异常来停止训练
            raise KeyboardInterrupt("用户请求停止训练")
        
        self.current_epoch = trainer.epoch + 1
        metrics = {}
        
        # 提取训练指标
        if hasattr(trainer, 'metrics'):
            m = trainer.metrics
            if hasattr(m, 'box'):
                metrics['mAP50'] = round(float(m.box.map50), 4)
                metrics['mAP50-95'] = round(float(m.box.map), 4)
            if hasattr(trainer, 'loss'):
                metrics['loss'] = round(float(trainer.loss), 4)
        
        # 从trainer.validator获取验证指标
        if hasattr(trainer, 'validator') and trainer.validator:
            v = trainer.validator
            if hasattr(v, 'metrics') and v.metrics:
                vm = v.metrics
                if hasattr(vm, 'box'):
                    metrics['precision'] = round(float(vm.box.mp), 4)
                    metrics['recall'] = round(float(vm.box.mr), 4)
        
        progress = int((self.current_epoch / self.total_epochs) * 100)
        
        update_training_state(
            current_epoch=self.current_epoch,
            progress=progress,
            metrics=metrics
        )
        
        add_log(f"Epoch {self.current_epoch}/{self.total_epochs} - mAP50: {metrics.get('mAP50', 'N/A')}")


def run_training_task(config: Dict):
    """执行训练任务（在独立线程中运行）"""
    global stop_training_flag
    stop_training_flag = False
    
    try:
        from train_pipeline import DefectDetectionPipeline
        import argparse
        
        add_log("开始准备训练环境...")
        update_training_state(status='preparing')
        
        # 构建参数
        args = argparse.Namespace(
            data_dir=config.get('data_dir', 'dataset_raw'),
            epochs=config.get('epochs', 100),
            augment=config.get('augment', False),
            model_size=config.get('model_size', 'nano'),
            train_ratio=config.get('train_ratio', 0.7),  # 默认70%训练
            val_ratio=config.get('val_ratio', 0.15),     # 默认15%验证
            test_ratio=config.get('test_ratio', 0.15),   # 默认15%测试
            imgsz=config.get('imgsz', 640),
            batch=config.get('batch', None),
            conf=config.get('conf', 0.25),
            model=None,
            name=config.get('name', None),
            no_predict=config.get('no_predict', True),
            include_positive=config.get('include_positive', False)  # 正样本训练
        )
        
        # 根据模型大小设置模型文件和批次
        # 支持YOLO11和YOLOv8
        MODEL_MAP = {
            # YOLO11模型（默认）
            'nano': 'yolo11n.pt',
            'small': 'yolo11s.pt',
            'medium': 'yolo11m.pt',
            'large': 'yolo11l.pt',
            'x': 'yolo11x.pt',
            # YOLOv8模型（兼容）
            'v8nano': 'yolov8n.pt',
            'v8small': 'yolov8s.pt',
            'v8medium': 'yolov8m.pt',
            'v8large': 'yolov8l.pt',
            'v8x': 'yolov8x.pt'
        }
        BATCH_MAP = {
            'nano': 16, 'small': 12, 'medium': 8, 'large': 6, 'x': 4,
            'v8nano': 16, 'v8small': 12, 'v8medium': 8, 'v8large': 6, 'v8x': 4
        }
        
        args.model = MODEL_MAP.get(args.model_size, 'yolov8n.pt')
        if args.batch is None:
            args.batch = BATCH_MAP.get(args.model_size, 16)
        
        update_training_state(total_epochs=args.epochs)
        
        # 创建Pipeline
        pipeline = DefectDetectionPipeline(args)
        
        # Step 1: 收集类别
        add_log("收集数据集类别信息...")
        pipeline.collect_labels()
        add_log(f"发现 {len(pipeline.label_map)} 个类别: {list(pipeline.label_map.keys())}")
        
        # Step 2: 准备数据集
        add_log("准备YOLO格式数据集...")
        if args.include_positive:
            add_log("正样本训练已启用：未标注图片将作为正样本参与训练", level='info')
        yaml_path, all_pairs = pipeline.prepare_dataset()
        add_log(f"数据集准备完成，共 {len(all_pairs)} 张标注图片")
        
        # Step 3: 数据增强
        if args.augment:
            add_log("执行数据增强...")
            pipeline.augment_data()
        
        # Step 4: 训练
        add_log(f"开始训练 ({args.epochs} epochs)...")
        update_training_state(status='training')
        
        from ultralytics import YOLO
        
        model = YOLO(args.model)
        
        # 训练回调
        callback = TrainingCallback(args.epochs)
        
        # 注册回调
        model.add_callback('on_train_epoch_end', callback.on_train_epoch_end)
        
        results = model.train(
            data=str(yaml_path),
            epochs=args.epochs,
            imgsz=args.imgsz,
            batch=args.batch,
            project=str(pipeline.runs_dir),
            name=pipeline.run_name,
            exist_ok=True,
            verbose=True
        )
        
        best_model_path = pipeline.runs_dir / pipeline.run_name / 'weights' / 'best.pt'
        
        add_log(f"训练完成! 模型保存至: {best_model_path}", level='success')

        # 注册模型
        registry = load_models_registry()

        # 计算版本号（同名模型自动递增版本）
        base_name = config.get('project_name', pipeline.run_name)
        existing_versions = [
            m.get('version', 1) for m in registry['models']
            if m.get('name', '').startswith(base_name)
        ]
        next_version = max(existing_versions) + 1 if existing_versions else 1

        model_info = {
            'id': str(uuid.uuid4())[:8],
            'name': base_name,
            'version': next_version,
            'version_tag': 'untagged',
            'run_name': pipeline.run_name,
            'model_path': str(best_model_path),
            'model_size': args.model_size,
            'epochs': args.epochs,
            'dataset': args.data_dir,
            'classes': list(pipeline.label_map.keys()),
            'num_classes': len(pipeline.label_map),
            'created_at': datetime.now().isoformat(),
            'metrics': training_state.get('metrics', {}),
            'augment': args.augment,
            'imgsz': args.imgsz,
            'status': 'completed'
        }
        registry['models'].append(model_info)
        save_models_registry(registry)
        
        update_training_state(
            status='completed',
            progress=100,
            is_training=False
        )
        
        add_log("模型已注册到模型库", level='success')
        
    except KeyboardInterrupt:
        add_log("训练已被用户停止", level='warning')
        update_training_state(
            status='stopped',
            is_training=False
        )
    except Exception as e:
        add_log(f"训练失败: {str(e)}", level='error')
        update_training_state(
            status='failed',
            is_training=False
        )
    finally:
        reset_stop_flag()


def reset_stop_flag():
    """重置停止标志"""
    global stop_training_flag
    stop_training_flag = False


# ============== 训练队列管理 ==============

def training_queue_worker():
    """训练队列工作线程"""
    while True:
        try:
            # 阻塞等待队列中的任务
            task = training_queue.get(timeout=1)

            if task is None:  # 退出信号
                break

            task_id = task['task_id']
            config = task['config']

            add_log(f"从队列中获取训练任务: {task_id}", level='info')

            # 更新任务状态为运行中
            with queue_lock:
                for item in training_history:
                    if item['task_id'] == task_id:
                        item['status'] = 'running'
                        item['start_time'] = datetime.now().isoformat()
                        break

            # 执行训练
            run_training_task(config)

            # 更新任务状态
            with queue_lock:
                for item in training_history:
                    if item['task_id'] == task_id:
                        item['status'] = training_state.get('status', 'completed')
                        item['end_time'] = datetime.now().isoformat()
                        item['metrics'] = training_state.get('metrics', {})
                        break

            training_queue.task_done()

        except Exception as e:
            if str(e) != '':  # 忽略timeout异常
                add_log(f"队列工作线程错误: {str(e)}", level='error')
                with queue_lock:
                    for item in training_history:
                        if item.get('task_id') == task_id:
                            item['status'] = 'failed'
                            item['error'] = str(e)
                            break


# ============== API 路由 ==============

@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({'status': 'ok', 'service': 'training-server'})


@app.route('/train/start', methods=['POST'])
def start_training():
    """启动训练任务"""
    if training_state['is_training']:
        return jsonify({'error': '已有训练任务在进行中'}), 400
    
    config = request.get_json() or {}
    
    # 验证数据集目录
    # 验证数据集目录
    data_dir_param = config.get('data_dir', 'dataset_raw')
    
    # 检查是否为 Managed Dataset (传递的是Name或ID)
    target_dataset_id = None
    managed_datasets_dir = BASE_DIR / 'datasets'
    
    # 尝试匹配 ID 或 Name
    if managed_datasets_dir.exists():
        # 先直接当作ID检查
        if (managed_datasets_dir / data_dir_param).exists():
             target_dataset_id = data_dir_param
        else:
            # 遍历查找 Name
            for item in managed_datasets_dir.iterdir():
                if item.is_dir() and (item / 'metadata.json').exists():
                    try:
                        with open(item / 'metadata.json', 'r') as f:
                            meta = json.load(f)
                            if meta.get('name') == data_dir_param:
                                target_dataset_id = meta.get('id')
                                break
                    except:
                        pass
    
    if target_dataset_id:
        add_log(f"同步管理数据集: {target_dataset_id}...", level='info')
        try:
            data_path = sync_managed_dataset(target_dataset_id)
            # 更新 config 中的 data_dir 为实际路径 (relative to BASE_DIR for pipeline)
            # pipeline 需要的是相对于 BASE_DIR 的路径字符串，或者是绝对路径
            # 这里我们传递相对于 BASE_DIR 的路径字符串，例如 'training_datasets/xyz'
            config['data_dir'] = str(data_path.relative_to(BASE_DIR))
        except Exception as e:
            return jsonify({'error': f'数据集同步失败: {str(e)}'}), 500
    else:
        # 原始目录模式
        data_path = BASE_DIR / data_dir_param
        if not data_path.exists():
            return jsonify({'error': f'数据集目录不存在: {data_dir_param}'}), 400
    
    # 重置状态
    task_id = str(uuid.uuid4())[:8]
    with state_lock:
        training_state.update({
            'is_training': True,
            'task_id': task_id,
            'progress': 0,
            'current_epoch': 0,
            'total_epochs': config.get('epochs', 100),
            'metrics': {},
            'logs': [],
            'status': 'preparing',
            'start_time': datetime.now().isoformat(),
            'config': config
        })
    
    # 在后台线程执行训练
    thread = threading.Thread(target=run_training_task, args=(config,), daemon=True)
    thread.start()
    
    return jsonify({
        'task_id': task_id,
        'message': '训练任务已启动',
        'config': config
    })


@app.route('/train/status', methods=['GET'])
def get_training_status():
    """获取训练状态（支持视觉和音频）"""
    with state_lock:
        status_data = {
            'is_training': training_state['is_training'],
            'task_id': training_state['task_id'],
            'status': training_state['status'],
            'progress': training_state['progress'],
            'current_epoch': training_state['current_epoch'],
            'total_epochs': training_state['total_epochs'],
            'metrics': training_state['metrics'],
            'start_time': training_state['start_time'],
            'config': training_state['config']
        }

        # 判断训练类型
        if training_state['task_id']:
            if 'audio' in training_state['task_id']:
                status_data['training_type'] = 'audio'
            else:
                status_data['training_type'] = 'visual'
        else:
            status_data['training_type'] = None

        return jsonify(status_data)


@app.route('/train/logs', methods=['GET'])
def get_training_logs():
    """获取训练日志"""
    with state_lock:
        return jsonify({
            'logs': training_state['logs'][-100:]  # 返回最近100条
        })


@app.route('/train/logs/stream')
def stream_logs():
    """SSE日志流"""
    def generate():
        while True:
            try:
                log = log_queue.get(timeout=30)
                yield f"data: {json.dumps(log)}\n\n"
            except:
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
    
    return Response(generate(), mimetype='text/event-stream')


@app.route('/train/stop', methods=['POST'])
def stop_training():
    """停止训练"""
    global stop_training_flag

    if not training_state['is_training']:
        return jsonify({'error': '没有正在进行的训练任务'}), 400

    # 设置停止标志，训练循环会在下一个epoch检测到并停止
    stop_training_flag = True
    add_log("正在停止训练，请等待当前epoch完成...", level='warning')

    return jsonify({'message': '训练停止请求已发送，将在当前epoch结束后停止'})


# ============== 训练队列API ==============

@app.route('/train/queue/add', methods=['POST'])
def add_to_queue():
    """添加训练任务到队列"""
    config = request.get_json() or {}

    # 验证数据集目录（与start_training相同的逻辑）
    data_dir_param = config.get('data_dir', 'dataset_raw')

    target_dataset_id = None
    managed_datasets_dir = BASE_DIR / 'datasets'

    if managed_datasets_dir.exists():
        if (managed_datasets_dir / data_dir_param).exists():
            target_dataset_id = data_dir_param
        else:
            for item in managed_datasets_dir.iterdir():
                if item.is_dir() and (item / 'metadata.json').exists():
                    try:
                        with open(item / 'metadata.json', 'r') as f:
                            meta = json.load(f)
                            if meta.get('name') == data_dir_param:
                                target_dataset_id = meta.get('id')
                                break
                    except:
                        pass

    if target_dataset_id:
        try:
            data_path = sync_managed_dataset(target_dataset_id)
            config['data_dir'] = str(data_path.relative_to(BASE_DIR))
        except Exception as e:
            return jsonify({'error': f'数据集同步失败: {str(e)}'}), 500
    else:
        data_path = BASE_DIR / data_dir_param
        if not data_path.exists():
            return jsonify({'error': f'数据集目录不存在: {data_dir_param}'}), 400

    # 创建任务
    task_id = str(uuid.uuid4())[:8]
    task = {
        'task_id': task_id,
        'config': config,
        'status': 'queued',
        'created_at': datetime.now().isoformat(),
        'project_name': config.get('project_name', 'unknown')
    }

    # 添加到队列和历史
    with queue_lock:
        training_queue.put(task)
        training_history.append(task.copy())

    add_log(f"训练任务已加入队列: {task_id}", level='info')

    return jsonify({
        'success': True,
        'task_id': task_id,
        'message': '任务已加入队列',
        'queue_position': training_queue.qsize()
    })


@app.route('/train/queue/status', methods=['GET'])
def get_queue_status():
    """获取队列状态"""
    with queue_lock:
        queue_size = training_queue.qsize()
        history = list(training_history)

    return jsonify({
        'queue_size': queue_size,
        'is_training': training_state['is_training'],
        'current_task': training_state.get('task_id'),
        'history': history
    })


@app.route('/train/queue/cancel/<task_id>', methods=['POST'])
def cancel_queued_task(task_id: str):
    """取消队列中的任务"""
    with queue_lock:
        # 查找任务
        task_found = False
        for item in list(training_history):
            if item['task_id'] == task_id:
                if item['status'] == 'queued':
                    item['status'] = 'cancelled'
                    item['cancelled_at'] = datetime.now().isoformat()
                    task_found = True
                    add_log(f"任务已取消: {task_id}", level='warning')
                    break
                elif item['status'] == 'running':
                    return jsonify({'error': '任务正在运行，请使用停止训练接口'}), 400
                else:
                    return jsonify({'error': '任务已完成，无法取消'}), 400

    if not task_found:
        return jsonify({'error': '任务不存在'}), 404

    return jsonify({
        'success': True,
        'message': '任务已取消',
        'task_id': task_id
    })


# ============== 模型管理 ==============

@app.route('/models', methods=['GET'])
def list_models():
    """获取视觉模型列表（排除音频模型）"""
    registry = load_models_registry()
    # 过滤掉音频模型，只返回视觉模型
    visual_models = [m for m in registry.get('models', []) if m.get('type') != 'audio_anomaly']
    # 添加版本信息
    for model in visual_models:
        model['version'] = model.get('version', 1)
        model['version_tag'] = model.get('version_tag', 'untagged')
    return jsonify({'models': visual_models})


@app.route('/models/<model_id>', methods=['GET'])
def get_model(model_id: str):
    """获取模型详情（支持版本历史）"""
    registry = load_models_registry()

    # 查找主模型
    main_model = None
    for model in registry['models']:
        if model['id'] == model_id:
            main_model = model
            break

    if not main_model:
        return jsonify({'error': '模型不存在'}), 404

    # 检查模型文件是否存在
    main_model['file_exists'] = Path(main_model['model_path']).exists()

    # 获取模型大小
    if main_model['file_exists']:
        main_model['file_size'] = os.path.getsize(main_model['model_path'])

    # 获取版本历史
    version_history = []
    base_name = main_model.get('name', '')
    for model in registry['models']:
        if model.get('base_model_id') == model_id or model['id'] == model_id:
            version_history.append({
                'id': model['id'],
                'version': model.get('version', 1),
                'version_tag': model.get('version_tag', 'untagged'),
                'created_at': model.get('created_at'),
                'metrics': model.get('metrics', {}),
                'notes': model.get('version_notes', '')
            })

    # 按版本号排序
    version_history.sort(key=lambda x: x['version'], reverse=True)
    main_model['version_history'] = version_history

    return jsonify(main_model)


@app.route('/models/<model_id>/download', methods=['GET'])
def download_model(model_id: str):
    """下载模型权重"""
    registry = load_models_registry()
    for model in registry['models']:
        if model['id'] == model_id:
            model_path = Path(model['model_path'])
            if model_path.exists():
                return send_file(
                    model_path,
                    as_attachment=True,
                    download_name=f"{model['name']}.pt"
                )
            return jsonify({'error': '模型文件不存在'}), 404
    
    return jsonify({'error': '模型不存在'}), 404


@app.route('/models/<model_id>', methods=['DELETE'])
def delete_model(model_id: str):
    """删除模型"""
    registry = load_models_registry()
    for i, model in enumerate(registry['models']):
        if model['id'] == model_id:
            # 删除模型文件
            model_path = Path(model['model_path'])
            if model_path.exists():
                # 删除整个运行目录
                run_dir = model_path.parent.parent
                if run_dir.exists() and run_dir.name.startswith('train_'):
                    shutil.rmtree(run_dir)

            # 从注册表删除
            registry['models'].pop(i)
            save_models_registry(registry)

            return jsonify({'message': '模型已删除'})

    return jsonify({'error': '模型不存在'}), 404


# ============== 模型版本管理 ==============

@app.route('/models/<model_id>/tag', methods=['POST'])
def tag_model_version(model_id: str):
    """为模型添加版本标签"""
    data = request.get_json() or {}
    tag = data.get('tag')  # production, testing, archived, untagged
    notes = data.get('notes', '')

    valid_tags = ['production', 'testing', 'archived', 'untagged']
    if tag not in valid_tags:
        return jsonify({'error': f'无效的标签，支持的标签: {", ".join(valid_tags)}'}), 400

    registry = load_models_registry()

    # 查找模型
    model_found = False
    for model in registry['models']:
        if model['id'] == model_id:
            # 如果要设置为production，先取消其他模型的production标签
            if tag == 'production':
                for m in registry['models']:
                    if m.get('version_tag') == 'production' and m['id'] != model_id:
                        m['version_tag'] = 'untagged'

            model['version_tag'] = tag
            model['version_notes'] = notes
            model['tag_updated_at'] = datetime.now().isoformat()
            model_found = True
            break

    if not model_found:
        return jsonify({'error': '模型不存在'}), 404

    save_models_registry(registry)
    add_log(f"模型 {model_id} 标签已更新为: {tag}", level='info')

    return jsonify({
        'success': True,
        'message': f'模型标签已更新为: {tag}',
        'model_id': model_id,
        'tag': tag
    })


@app.route('/models/<model_id>/compare/<target_id>', methods=['GET'])
def compare_models(model_id: str, target_id: str):
    """对比两个模型的指标"""
    registry = load_models_registry()

    model1 = None
    model2 = None

    for model in registry['models']:
        if model['id'] == model_id:
            model1 = model
        if model['id'] == target_id:
            model2 = model

    if not model1 or not model2:
        return jsonify({'error': '模型不存在'}), 404

    comparison = {
        'model1': {
            'id': model1['id'],
            'name': model1['name'],
            'version': model1.get('version', 1),
            'metrics': model1.get('metrics', {}),
            'epochs': model1.get('epochs'),
            'model_size': model1.get('model_size'),
            'created_at': model1.get('created_at')
        },
        'model2': {
            'id': model2['id'],
            'name': model2['name'],
            'version': model2.get('version', 1),
            'metrics': model2.get('metrics', {}),
            'epochs': model2.get('epochs'),
            'model_size': model2.get('model_size'),
            'created_at': model2.get('created_at')
        },
        'differences': {}
    }

    # 计算指标差异
    metrics1 = model1.get('metrics', {})
    metrics2 = model2.get('metrics', {})

    for key in set(list(metrics1.keys()) + list(metrics2.keys())):
        val1 = metrics1.get(key, 0)
        val2 = metrics2.get(key, 0)
        if isinstance(val1, (int, float)) and isinstance(val2, (int, float)):
            diff = val2 - val1
            comparison['differences'][key] = {
                'model1': val1,
                'model2': val2,
                'difference': round(diff, 4),
                'improvement': round((diff / val1 * 100) if val1 != 0 else 0, 2)
            }

    return jsonify(comparison)


@app.route('/models/<model_id>/deploy', methods=['POST'])
def deploy_model(model_id: str):
    """部署模型到视觉大师智能体（支持按零件类型部署）"""
    data = request.get_json() or {}
    part_type = data.get('part_type', 'paint')  # 默认漆面类型
    
    # 验证零件类型
    valid_part_types = ['paint', 'electric_drive', 'glass']
    if part_type not in valid_part_types:
        return jsonify({'error': f'无效的零件类型: {part_type}，支持: {", ".join(valid_part_types)}'}), 400
    
    registry = load_models_registry()
    model_info = None
    
    for model in registry['models']:
        if model['id'] == model_id:
            model_info = model
            break
    
    if not model_info:
        return jsonify({'error': '模型不存在'}), 404
    
    source_path = Path(model_info['model_path'])
    if not source_path.exists():
        return jsonify({'error': '模型文件不存在'}), 404
    
    try:
        # 目标路径：model/models/<part_type>/model.pt
        vision_model_dir = BASE_DIR.parent / 'model'
        part_model_dir = vision_model_dir / 'models' / part_type
        part_model_dir.mkdir(parents=True, exist_ok=True)
        target_path = part_model_dir / 'model.pt'
        
        # 备份原有模型
        if target_path.exists():
            backup_path = part_model_dir / f'model_backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pt'
            shutil.copy(target_path, backup_path)
            add_log(f"已备份原模型到: {backup_path.name}")
        
        # 复制新模型
        shutil.copy(source_path, target_path)
        
        # 同时更新旧的兼容路径（漆面模型同时更新 yolov8n.pt）
        if part_type == 'paint':
            legacy_path = vision_model_dir / 'yolov8n.pt'
            if legacy_path.exists():
                backup_legacy = vision_model_dir / f'yolov8n_backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pt'
                shutil.copy(legacy_path, backup_legacy)
            shutil.copy(source_path, legacy_path)
        
        # 保存部署信息到 JSON 文件
        deploy_info_path = part_model_dir / 'deploy_info.json'
        deploy_info = {
            'model_id': model_id,
            'model_name': model_info['name'],
            'part_type': part_type,
            'deployed_at': datetime.now().isoformat(),
            'metrics': model_info.get('metrics', {}),
            'classes': model_info.get('classes', [])
        }
        with open(deploy_info_path, 'w', encoding='utf-8') as f:
            json.dump(deploy_info, f, ensure_ascii=False, indent=2)
        
        # 更新模型注册表，标记已部署到哪个零件类型
        for model in registry['models']:
            if model['id'] == model_id:
                if 'deployed_parts' not in model:
                    model['deployed_parts'] = {}
                model['deployed_parts'][part_type] = {
                    'deployed_at': datetime.now().isoformat()
                }
                model['deployed'] = True
                model['deployed_at'] = datetime.now().isoformat()
                model['deployed_part_type'] = part_type
        save_models_registry(registry)
        
        # 触发 YOLO 服务重新加载模型（热重载）
        reload_success = False
        if requests:
            try:
                yolo_api_url = os.environ.get('YOLO_API_URL', 'http://localhost:5000')
                reload_response = requests.post(
                    f'{yolo_api_url}/model/reload',
                    json={'part_type': part_type},
                    timeout=10
                )
                if reload_response.status_code == 200:
                    reload_success = True
                    add_log(f"✅ 模型已部署到 [{part_type}] 并自动重新加载成功", level='success')
                else:
                    add_log(f"⚠️ 模型已部署，但重载失败: {reload_response.text}", level='warning')
            except Exception as e:
                add_log(f"⚠️ 模型已部署，但无法触发重载: {str(e)}。请手动重启 YOLO 服务", level='warning')
        else:
            add_log(f"⚠️ requests 库未安装，无法自动重载模型。请手动重启 YOLO 服务", level='warning')
        
        part_type_names = {'paint': '漆面', 'electric_drive': '电驱动总成', 'glass': '玻璃'}
        add_log(f"模型 {model_info['name']} 已部署到视觉大师 [{part_type_names.get(part_type, part_type)}]", level='success')
        
        return jsonify({
            'message': '模型部署成功',
            'model_name': model_info['name'],
            'part_type': part_type,
            'deployed_to': str(target_path),
            'reloaded': reload_success
        })
        
    except Exception as e:
        return jsonify({'error': f'部署失败: {str(e)}'}), 500


# ============== 模型评估/测试 ==============

@app.route('/evaluate/single', methods=['POST'])
def evaluate_single():
    """单图推理测试"""
    data = request.get_json()
    
    if not data or 'image' not in data:
        return jsonify({'error': '未提供图片'}), 400
    
    model_id = data.get('model_id')
    if not model_id:
        return jsonify({'error': '未指定模型'}), 400
    
    # 查找模型
    registry = load_models_registry()
    model_info = None
    for m in registry['models']:
        if m['id'] == model_id:
            model_info = m
            break
    
    if not model_info:
        return jsonify({'error': '模型不存在'}), 404
    
    model_path = Path(model_info['model_path'])
    if not model_path.exists():
        return jsonify({'error': '模型文件不存在'}), 404
    
    try:
        from ultralytics import YOLO
        from PIL import Image
        import numpy as np
        
        # 加载模型
        model = YOLO(str(model_path))
        
        # 解码图片
        image_data = base64.b64decode(data['image'])
        image = Image.open(io.BytesIO(image_data))
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # 推理
        conf = data.get('confidence', 0.25)
        results = model.predict(source=np.array(image), conf=conf, verbose=False)
        
        # 解析结果
        detections = []
        for result in results:
            boxes = result.boxes
            if boxes is not None:
                for box in boxes:
                    cls_id = int(box.cls[0])
                    cls_name = result.names[cls_id]
                    conf_val = float(box.conf[0])
                    bbox = box.xyxy[0].tolist()
                    
                    detections.append({
                        'class': cls_name,
                        'confidence': round(conf_val, 3),
                        'bbox': [round(x, 2) for x in bbox]
                    })
        
        return jsonify({
            'model': model_info['name'],
            'detections': detections,
            'count': len(detections)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/evaluate/batch', methods=['POST'])
def evaluate_batch():
    """批量推理测试"""
    data = request.get_json()

    if not data or 'images' not in data:
        return jsonify({'error': '未提供图片列表'}), 400

    model_id = data.get('model_id')
    if not model_id:
        return jsonify({'error': '未指定模型'}), 400

    images = data.get('images', [])
    if len(images) == 0:
        return jsonify({'error': '图片列表为空'}), 400

    # 查找模型
    registry = load_models_registry()
    model_info = None
    for m in registry['models']:
        if m['id'] == model_id:
            model_info = m
            break

    if not model_info:
        return jsonify({'error': '模型不存在'}), 404

    model_path = Path(model_info['model_path'])
    if not model_path.exists():
        return jsonify({'error': '模型文件不存在'}), 404

    try:
        from ultralytics import YOLO
        from PIL import Image
        import numpy as np

        # 加载模型
        model = YOLO(str(model_path))
        conf = data.get('confidence', 0.25)

        # 批量处理
        results_list = []
        for idx, img_data in enumerate(images):
            try:
                # 解码图片
                image_data = base64.b64decode(img_data['image'])
                image = Image.open(io.BytesIO(image_data))
                if image.mode != 'RGB':
                    image = image.convert('RGB')

                # 推理
                results = model.predict(source=np.array(image), conf=conf, verbose=False)

                # 解析结果
                detections = []
                for result in results:
                    boxes = result.boxes
                    if boxes is not None:
                        for box in boxes:
                            cls_id = int(box.cls[0])
                            cls_name = result.names[cls_id]
                            conf_val = float(box.conf[0])
                            bbox = box.xyxy[0].tolist()

                            detections.append({
                                'class': cls_name,
                                'confidence': round(conf_val, 3),
                                'bbox': [round(x, 2) for x in bbox]
                            })

                results_list.append({
                    'id': img_data.get('id', f'image_{idx}'),
                    'filename': img_data.get('filename', f'image_{idx}.jpg'),
                    'detections': detections,
                    'count': len(detections),
                    'status': 'success'
                })

            except Exception as e:
                results_list.append({
                    'id': img_data.get('id', f'image_{idx}'),
                    'filename': img_data.get('filename', f'image_{idx}.jpg'),
                    'detections': [],
                    'count': 0,
                    'status': 'error',
                    'error': str(e)
                })

        # 统计
        total = len(results_list)
        success = sum(1 for r in results_list if r['status'] == 'success')
        total_detections = sum(r['count'] for r in results_list)

        return jsonify({
            'model': model_info['name'],
            'results': results_list,
            'summary': {
                'total_images': total,
                'success_count': success,
                'failed_count': total - success,
                'total_detections': total_detections,
                'avg_detections_per_image': round(total_detections / total, 2) if total > 0 else 0
            }
        })

    except Exception as e:
        return jsonify({'error': f'批量评测失败: {str(e)}'}), 500


@app.route('/evaluate/metrics/<model_id>', methods=['GET'])
def get_model_metrics(model_id: str):
    """获取模型评估指标"""
    registry = load_models_registry()
    for model in registry['models']:
        if model['id'] == model_id:
            # 查找训练结果
            run_name = model.get('run_name', '')
            results_csv = RUNS_DIR / run_name / 'results.csv'
            
            metrics = model.get('metrics', {})
            
            # 如果有results.csv，解析训练曲线数据
            if results_csv.exists():
                import csv
                history = {'epoch': [], 'train_loss': [], 'val_loss': [], 'mAP50': [], 'mAP50-95': []}
                
                with open(results_csv, 'r') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        history['epoch'].append(int(row.get('epoch', 0)))
                        history['train_loss'].append(float(row.get('train/box_loss', 0)))
                        history['mAP50'].append(float(row.get('metrics/mAP50(B)', 0)))
                        history['mAP50-95'].append(float(row.get('metrics/mAP50-95(B)', 0)))
                
                return jsonify({
                    'metrics': metrics,
                    'history': history
                })
            
            return jsonify({'metrics': metrics, 'history': None})
    
    return jsonify({'error': '模型不存在'}), 404


# ============== 数据集相关 ==============

@app.route('/datasets', methods=['GET'])
def list_datasets():
    """列出可用的数据集目录（包括dataset_raw和dataset_server管理的数据集，支持分页）"""
    # 获取分页参数
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    search = request.args.get('search', '', type=str)

    datasets = []

    # 1. 扫描 training 目录下的原始数据集
    for item in BASE_DIR.iterdir():
        if item.is_dir() and not item.name.startswith('.') and not item.name.startswith('__'):
            # 排除特殊目录
            if item.name in ['runs', 'datasets', 'training_datasets', 'weights', 'dataset_raw']:
                continue

            images_dir = item / 'images'
            annotations_dir = item / 'annotations'

            if images_dir.exists():
                image_count = len(list(images_dir.glob('*')))
                annotation_count = 0
                if annotations_dir.exists():
                    annotation_count = len(list(annotations_dir.glob('*.json')))
                elif (item / 'labels').exists():
                    annotation_count = len(list((item / 'labels').glob('*.txt')))

                datasets.append({
                    'name': item.name,
                    'path': str(item),
                    'image_count': image_count,
                    'annotation_count': annotation_count,
                    'type': 'raw',
                    'created_at': datetime.fromtimestamp(item.stat().st_ctime).isoformat()
                })

    # 2. 添加 dataset_raw (如果存在)
    if DATASET_RAW_DIR.exists():
        images_dir = DATASET_RAW_DIR / 'images'
        annotations_dir = DATASET_RAW_DIR / 'annotations'
        if images_dir.exists():
            image_count = len(list(images_dir.glob('*')))
            annotation_count = len(list(annotations_dir.glob('*.json'))) if annotations_dir.exists() else 0
            datasets.append({
                'name': 'dataset_raw',
                'path': str(DATASET_RAW_DIR),
                'image_count': image_count,
                'annotation_count': annotation_count,
                'type': 'raw',
                'created_at': datetime.fromtimestamp(DATASET_RAW_DIR.stat().st_ctime).isoformat()
            })

    # 3. 扫描 dataset_server 管理的数据集
    managed_datasets_dir = BASE_DIR / 'datasets'
    if managed_datasets_dir.exists():
        for item in managed_datasets_dir.iterdir():
            if item.is_dir():
                metadata_path = item / 'metadata.json'
                if metadata_path.exists():
                    try:
                        with open(metadata_path, 'r', encoding='utf-8') as f:
                            meta = json.load(f)
                            datasets.append({
                                'name': meta.get('name', item.name),
                                'id': meta.get('id', item.name),
                                'path': str(item),
                                'image_count': meta.get('stats', {}).get('totalImages', 0),
                                'annotation_count': meta.get('stats', {}).get('totalAnnotations', 0),
                                'type': 'managed',
                                'created_at': meta.get('createdAt', '')
                            })
                    except:
                        pass

    # 搜索过滤
    if search:
        datasets = [d for d in datasets if search.lower() in d['name'].lower()]

    # 排序（按创建时间倒序）
    datasets.sort(key=lambda x: x.get('created_at', ''), reverse=True)

    # 分页
    total = len(datasets)
    start = (page - 1) * page_size
    end = start + page_size
    paginated_datasets = datasets[start:end]

    return jsonify({
        'datasets': paginated_datasets,
        'pagination': {
            'page': page,
            'page_size': page_size,
            'total': total,
            'total_pages': (total + page_size - 1) // page_size if total > 0 else 0,
            'has_next': end < total,
            'has_prev': page > 1
        }
    })


@app.route('/datasets/prepare', methods=['POST'])
def prepare_dataset():
    """从前端标注数据准备训练数据集"""
    data = request.get_json()
    
    if not data or 'images' not in data:
        return jsonify({'error': '未提供数据'}), 400
    
    dataset_name = data.get('name', f'dataset_{datetime.now().strftime("%Y%m%d_%H%M%S")}')
    output_dir = BASE_DIR / dataset_name
    images_dir = output_dir / 'images'
    annotations_dir = output_dir / 'annotations'
    
    # 创建目录
    images_dir.mkdir(parents=True, exist_ok=True)
    annotations_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        for img_data in data['images']:
            img_name = img_data['name']
            
            # 保存图片（如果提供了base64数据）
            if 'data' in img_data:
                image_bytes = base64.b64decode(img_data['data'])
                with open(images_dir / img_name, 'wb') as f:
                    f.write(image_bytes)
            
            # 保存标注
            if 'annotations' in img_data:
                ann_name = Path(img_name).stem + '.json'
                ann_data = {
                    'imageName': img_name,
                    'annotations': img_data['annotations']
                }
                with open(annotations_dir / ann_name, 'w', encoding='utf-8') as f:
                    json.dump(ann_data, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            'message': '数据集准备完成',
            'dataset_name': dataset_name,
            'image_count': len(data['images'])
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============== 数据集导入训练功能 ==============

@app.route('/datasets/<dataset_id>/export-for-training', methods=['POST'])
def export_dataset_for_training(dataset_id: str):
    """
    将数据集服务的数据集转换为YOLO训练格式

    功能：
    1. 从 datasets/<dataset_id> 读取图片和标注
    2. 转换标注格式：添加imageName字段以兼容train_pipeline
    3. 复制到训练目录：training_datasets/<dataset_id>
    4. 返回转换后的数据集路径
    """
    try:
        # 源数据集路径（dataset_server管理的数据集）
        dataset_server_dir = BASE_DIR.parent / 'training' / 'datasets' / dataset_id

        if not dataset_server_dir.exists():
            return jsonify({'error': f'数据集不存在: {dataset_id}'}), 404

        # 读取元数据
        metadata_path = dataset_server_dir / 'metadata.json'
        if not metadata_path.exists():
            return jsonify({'error': '数据集元数据文件不存在'}), 404

        with open(metadata_path, 'r', encoding='utf-8') as f:
            metadata = json.load(f)

        # 检查数据集是否有图片和标注
        if metadata.get('stats', {}).get('totalImages', 0) == 0:
            return jsonify({'error': '数据集为空，没有图片'}), 400

        if metadata.get('stats', {}).get('annotatedImages', 0) == 0:
            return jsonify({'error': '数据集没有标注数据，请先完成标注'}), 400

        # 目标训练数据集目录
        training_dataset_dir = BASE_DIR / 'training_datasets' / dataset_id
        training_images_dir = training_dataset_dir / 'images'
        training_annotations_dir = training_dataset_dir / 'annotations'

        # 创建目录
        training_images_dir.mkdir(parents=True, exist_ok=True)
        training_annotations_dir.mkdir(parents=True, exist_ok=True)

        # 源目录
        source_images_dir = dataset_server_dir / 'images'
        source_annotations_dir = dataset_server_dir / 'annotations'

        converted_count = 0
        skipped_count = 0

        # 遍历所有图片
        for image_info in metadata.get('images', []):
            if not image_info.get('isAnnotated', False):
                skipped_count += 1
                continue

            image_id = image_info['id']
            stored_filename = image_info.get('storedFilename', f"{image_id}.jpg")
            original_filename = image_info.get('filename', stored_filename)

            # 复制图片
            source_image = source_images_dir / stored_filename
            target_image = training_images_dir / stored_filename

            if source_image.exists():
                shutil.copy(source_image, target_image)
            else:
                print(f"警告: 图片文件不存在 {source_image}")
                skipped_count += 1
                continue

            # 读取并转换标注
            source_annotation = source_annotations_dir / f"{image_id}.json"
            target_annotation = training_annotations_dir / f"{stored_filename.rsplit('.', 1)[0]}.json"

            if source_annotation.exists():
                with open(source_annotation, 'r', encoding='utf-8') as f:
                    annotation_data = json.load(f)

                # 转换格式：添加imageName字段，保持annotations格式不变
                converted_annotation = {
                    'imageName': stored_filename,
                    'annotations': annotation_data.get('annotations', []),
                    'masks': annotation_data.get('masks', [])
                }

                with open(target_annotation, 'w', encoding='utf-8') as f:
                    json.dump(converted_annotation, f, ensure_ascii=False, indent=2)

                converted_count += 1
            else:
                skipped_count += 1

        add_log(f"数据集转换完成: {converted_count} 张图片, 跳过 {skipped_count} 张", level='info')

        return jsonify({
            'success': True,
            'message': '数据集转换成功',
            'dataset_path': str(training_dataset_dir.relative_to(BASE_DIR)),
            'converted_count': converted_count,
            'skipped_count': skipped_count,
            'classes': metadata.get('defectTypes', [])
        })

    except Exception as e:
        return jsonify({'error': f'转换失败: {str(e)}'}), 500


@app.route('/train/start-from-dataset', methods=['POST'])
def start_training_from_dataset():
    """
    从数据集ID直接启动训练
    """
    if training_state['is_training']:
        return jsonify({'error': '已有训练任务在进行中'}), 400

    config = request.get_json() or {}
    dataset_id = config.get('dataset_id')

    if not dataset_id:
        return jsonify({'error': '未指定数据集ID'}), 400

    try:
        # Step 1: 转换数据集格式
        add_log(f"正在准备数据集: {dataset_id}", level='info')
        
        # 调用同步函数
        try:
            training_dataset_dir = sync_managed_dataset(dataset_id)
        except Exception as e:
             return jsonify({'error': f'数据集同步失败: {str(e)}'}), 404
        
        # 获取数据集名称用于日志
        dataset_name = dataset_id
        try:
             with open(BASE_DIR / 'datasets' / dataset_id / 'metadata.json', 'r') as f:
                 dataset_name = json.load(f).get('name', dataset_id)
        except:
            pass

        add_log(f"数据集准备完成: {dataset_name}", level='success')

        # Step 2: 启动训练
        training_config = {
            'data_dir': str(training_dataset_dir.relative_to(BASE_DIR)), # 使用相对路径
            'model_size': config.get('model_size', 'small'),
            'epochs': config.get('epochs', 100),
            'augment': config.get('augment', True),
            'project_name': config.get('project_name', f"{dataset_name}_model"),
            'imgsz': config.get('imgsz', 640),
            'batch': config.get('batch', None),
            'train_ratio': config.get('train_ratio', 0.7),
            'val_ratio': config.get('val_ratio', 0.15),
            'test_ratio': config.get('test_ratio', 0.15),
            'dataset_id': dataset_id # 保存 dataset_id 以便追踪
        }

        # 重置状态
        task_id = str(uuid.uuid4())[:8]
        with state_lock:
            training_state.update({
                'is_training': True,
                'task_id': task_id,
                'progress': 0,
                'current_epoch': 0,
                'total_epochs': training_config['epochs'],
                'metrics': {},
                'logs': [],
                'status': 'preparing',
                'start_time': datetime.now().isoformat(),
                'config': training_config,
                'dataset_id': dataset_id,
                'dataset_name': dataset_name
            })

        # 在后台线程执行训练
        thread = threading.Thread(target=run_training_task, args=(training_config,), daemon=True)
        thread.start()

        add_log(f"训练任务已启动: {task_id}", level='success')

        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': '训练任务已启动',
            'dataset_name': dataset_name,
            'config': training_config
        })

    except Exception as e:
        add_log(f"启动训练失败: {str(e)}", level='error')
        return jsonify({'error': f'启动训练失败: {str(e)}'}), 500


# ============== 数据集导入导出 ==============

@app.route('/datasets/<dataset_id>/export', methods=['POST'])
def export_dataset(dataset_id: str):
    """导出数据集为ZIP文件"""
    data = request.get_json() or {}
    format_type = data.get('format', 'raw')  # raw, yolo, coco

    # 查找数据集
    dataset_path = None
    managed_datasets_dir = BASE_DIR / 'datasets'

    if (managed_datasets_dir / dataset_id).exists():
        dataset_path = managed_datasets_dir / dataset_id
    else:
        training_dataset_path = BASE_DIR / 'training_datasets' / dataset_id
        if training_dataset_path.exists():
            dataset_path = training_dataset_path
        else:
            return jsonify({'error': '数据集不存在'}), 404

    try:
        # 创建临时目录
        temp_dir = tempfile.mkdtemp()
        zip_path = Path(temp_dir) / f'{dataset_id}_{format_type}.zip'

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            if format_type == 'raw':
                # 原始格式：images/ + annotations/
                images_dir = dataset_path / 'images'
                annotations_dir = dataset_path / 'annotations'

                if images_dir.exists():
                    for img_file in images_dir.iterdir():
                        if img_file.is_file():
                            zipf.write(img_file, f'images/{img_file.name}')

                if annotations_dir.exists():
                    for ann_file in annotations_dir.iterdir():
                        if ann_file.is_file():
                            zipf.write(ann_file, f'annotations/{ann_file.name}')

                # 添加元数据
                metadata_path = dataset_path / 'metadata.json'
                if metadata_path.exists():
                    zipf.write(metadata_path, 'metadata.json')

            elif format_type == 'yolo':
                # YOLO格式：train/val/test目录，每个包含images和labels
                # 这里简化处理，实际需要根据数据集分割
                images_dir = dataset_path / 'images'
                annotations_dir = dataset_path / 'annotations'

                if images_dir.exists() and annotations_dir.exists():
                    for img_file in images_dir.iterdir():
                        if img_file.is_file():
                            zipf.write(img_file, f'train/images/{img_file.name}')

                            # 转换标注为YOLO格式
                            ann_file = annotations_dir / f"{img_file.stem}.json"
                            if ann_file.exists():
                                # 读取标注并转换为YOLO格式 (简化版本)
                                with open(ann_file, 'r') as f:
                                    ann_data = json.load(f)

                                yolo_label = convert_to_yolo_format(ann_data)
                                zipf.writestr(f'train/labels/{img_file.stem}.txt', yolo_label)

        add_log(f"数据集 {dataset_id} 导出成功 (格式: {format_type})", level='info')

        return send_file(
            zip_path,
            as_attachment=True,
            download_name=f'{dataset_id}_{format_type}.zip',
            mimetype='application/zip'
        )

    except Exception as e:
        return jsonify({'error': f'导出失败: {str(e)}'}), 500


@app.route('/datasets/import', methods=['POST'])
def import_dataset():
    """从ZIP文件导入数据集"""
    if 'file' not in request.files:
        return jsonify({'error': '未提供文件'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '未选择文件'}), 400

    if not file.filename.endswith('.zip'):
        return jsonify({'error': '只支持ZIP格式'}), 400

    try:
        # 创建临时目录
        temp_dir = tempfile.mkdtemp()
        zip_path = Path(temp_dir) / file.filename
        file.save(zip_path)

        # 解压
        extract_dir = Path(temp_dir) / 'extracted'
        with zipfile.ZipFile(zip_path, 'r') as zipf:
            zipf.extractall(extract_dir)

        # 检测数据集格式
        format_type = detect_dataset_format(extract_dir)
        add_log(f"检测到数据集格式: {format_type}", level='info')

        # 创建新数据集ID
        dataset_id = str(uuid.uuid4())[:8]
        target_dir = BASE_DIR / 'training_datasets' / dataset_id
        target_images_dir = target_dir / 'images'
        target_annotations_dir = target_dir / 'annotations'

        target_images_dir.mkdir(parents=True, exist_ok=True)
        target_annotations_dir.mkdir(parents=True, exist_ok=True)

        # 根据格式导入
        if format_type == 'raw':
            # 直接复制
            source_images = extract_dir / 'images'
            source_annotations = extract_dir / 'annotations'

            if source_images.exists():
                for img_file in source_images.iterdir():
                    if img_file.is_file():
                        shutil.copy(img_file, target_images_dir / img_file.name)

            if source_annotations.exists():
                for ann_file in source_annotations.iterdir():
                    if ann_file.is_file():
                        shutil.copy(ann_file, target_annotations_dir / ann_file.name)

        elif format_type == 'yolo':
            # YOLO格式转换
            for split in ['train', 'val', 'test']:
                split_images = extract_dir / split / 'images'
                split_labels = extract_dir / split / 'labels'

                if split_images.exists():
                    for img_file in split_images.iterdir():
                        if img_file.is_file():
                            shutil.copy(img_file, target_images_dir / img_file.name)

                            # 转换YOLO标签为JSON格式
                            label_file = split_labels / f"{img_file.stem}.txt"
                            if label_file.exists():
                                json_ann = convert_from_yolo_format(label_file)
                                json_path = target_annotations_dir / f"{img_file.stem}.json"
                                with open(json_path, 'w') as f:
                                    json.dump(json_ann, f, ensure_ascii=False, indent=2)

        # 清理临时文件
        shutil.rmtree(temp_dir)

        add_log(f"数据集导入成功: {dataset_id}", level='success')

        return jsonify({
            'success': True,
            'message': '数据集导入成功',
            'dataset_id': dataset_id,
            'format': format_type
        })

    except Exception as e:
        return jsonify({'error': f'导入失败: {str(e)}'}), 500


def detect_dataset_format(path: Path) -> str:
    """检测数据集格式"""
    if (path / 'images').exists() and (path / 'annotations').exists():
        return 'raw'
    elif (path / 'train' / 'images').exists() or (path / 'train' / 'labels').exists():
        return 'yolo'
    elif (path / 'annotations').exists():
        # 检查是否为COCO格式
        for f in (path / 'annotations').iterdir():
            if f.name.endswith('.json') and f.stat().st_size > 1000:
                return 'coco'
    return 'unknown'


def convert_to_yolo_format(ann_data: dict) -> str:
    """将标注转换为YOLO格式 (简化版本)"""
    # 这里需要实际的转换逻辑
    # 格式: <class_id> <x_center> <y_center> <width> <height> (归一化坐标)
    lines = []
    for ann in ann_data.get('annotations', []):
        # 简化处理，实际需要根据图像尺寸归一化
        class_id = 0  # 需要类别映射
        x, y, w, h = ann.get('bbox', [0, 0, 0, 0])
        lines.append(f"{class_id} {x} {y} {w} {h}")
    return '\n'.join(lines)


def convert_from_yolo_format(label_file: Path) -> dict:
    """从YOLO格式转换为JSON标注 (简化版本)"""
    annotations = []
    with open(label_file, 'r') as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 5:
                class_id, x, y, w, h = parts[:5]
                annotations.append({
                    'class': int(class_id),
                    'bbox': [float(x), float(y), float(w), float(h)],
                    'type': 'bbox'
                })

    return {
        'imageName': label_file.stem + '.jpg',
        'annotations': annotations
    }


# ============== 存储空间管理 ==============

@app.route('/storage/info', methods=['GET'])
def get_storage_info():
    """获取存储空间信息"""
    try:
        storage_info = {
            'augmented_datasets': [],
            'yaml_files': [],
            'old_runs': [],
            'total_size_mb': 0
        }

        # 扫描增强数据集目录
        for item in BASE_DIR.glob('datasets_train_*'):
            if item.is_dir():
                size = sum(f.stat().st_size for f in item.rglob('*') if f.is_file())
                storage_info['augmented_datasets'].append({
                    'name': item.name,
                    'path': str(item),
                    'size_mb': round(size / 1024 / 1024, 2),
                    'modified': datetime.fromtimestamp(item.stat().st_mtime).isoformat()
                })

        # 扫描YAML文件
        for item in BASE_DIR.glob('data_train_*.yaml'):
            if item.is_file():
                storage_info['yaml_files'].append({
                    'name': item.name,
                    'path': str(item),
                    'size_kb': round(item.stat().st_size / 1024, 2),
                    'modified': datetime.fromtimestamp(item.stat().st_mtime).isoformat()
                })

        # 扫描旧的训练结果
        runs_dir = RUNS_DIR
        if runs_dir.exists():
            for item in runs_dir.glob('train_*'):
                if item.is_dir():
                    size = sum(f.stat().st_size for f in item.rglob('*') if f.is_file())
                    storage_info['old_runs'].append({
                        'name': item.name,
                        'path': str(item),
                        'size_mb': round(size / 1024 / 1024, 2),
                        'modified': datetime.fromtimestamp(item.stat().st_mtime).isoformat()
                    })

        # 计算总大小
        storage_info['total_size_mb'] = (
            sum(d['size_mb'] for d in storage_info['augmented_datasets']) +
            sum(d['size_mb'] for d in storage_info['old_runs']) +
            sum(d['size_kb'] / 1024 for d in storage_info['yaml_files'])
        )

        return jsonify(storage_info)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/storage/cleanup', methods=['POST'])
def cleanup_storage():
    """清理旧的存储数据"""
    try:
        data = request.get_json() or {}
        keep_days = data.get('keep_days', 7)
        cleanup_augmented = data.get('cleanup_augmented', True)
        cleanup_yaml = data.get('cleanup_yaml', True)
        cleanup_old_runs = data.get('cleanup_old_runs', False)

        now = time.time()
        cutoff_time = now - (keep_days * 24 * 3600)

        cleanup_results = {
            'deleted_items': [],
            'freed_space_mb': 0,
            'errors': []
        }

        # 清理增强数据集
        if cleanup_augmented:
            for item in BASE_DIR.glob('datasets_train_*'):
                if item.is_dir() and item.stat().st_mtime < cutoff_time:
                    try:
                        size = sum(f.stat().st_size for f in item.rglob('*') if f.is_file())
                        shutil.rmtree(item)
                        cleanup_results['deleted_items'].append(item.name)
                        cleanup_results['freed_space_mb'] += size / 1024 / 1024
                    except Exception as e:
                        cleanup_results['errors'].append(f"{item.name}: {str(e)}")

        # 清理YAML文件
        if cleanup_yaml:
            for item in BASE_DIR.glob('data_train_*.yaml'):
                if item.is_file() and item.stat().st_mtime < cutoff_time:
                    try:
                        size = item.stat().st_size
                        item.unlink()
                        cleanup_results['deleted_items'].append(item.name)
                        cleanup_results['freed_space_mb'] += size / 1024 / 1024
                    except Exception as e:
                        cleanup_results['errors'].append(f"{item.name}: {str(e)}")

        # 清理旧的训练结果（可选）
        if cleanup_old_runs:
            runs_dir = RUNS_DIR
            if runs_dir.exists():
                for item in runs_dir.glob('train_*'):
                    if item.is_dir() and item.stat().st_mtime < cutoff_time:
                        # 检查是否在模型注册表中
                        registry = load_models_registry()
                        is_registered = any(
                            m.get('run_name') == item.name
                            for m in registry.get('models', [])
                        )
                        if not is_registered:
                            try:
                                size = sum(f.stat().st_size for f in item.rglob('*') if f.is_file())
                                shutil.rmtree(item)
                                cleanup_results['deleted_items'].append(item.name)
                                cleanup_results['freed_space_mb'] += size / 1024 / 1024
                            except Exception as e:
                                cleanup_results['errors'].append(f"{item.name}: {str(e)}")

        cleanup_results['freed_space_mb'] = round(cleanup_results['freed_space_mb'], 2)
        add_log(f"存储清理完成: 释放 {cleanup_results['freed_space_mb']} MB", level='info')

        return jsonify(cleanup_results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============== 模型对比功能 ==============

# 导入对比API
try:
    from comparison_api import ModelComparisonAPI
    comparison_api = ModelComparisonAPI(str(BASE_DIR))
    COMPARISON_ENABLED = True
except ImportError:
    COMPARISON_ENABLED = False
    add_log("警告: 模型对比功能未启用 (comparison_api.py不可用)", level='warning')


@app.route('/comparison/start', methods=['POST'])
def start_model_comparison():
    """启动模型对比任务"""
    if not COMPARISON_ENABLED:
        return jsonify({'error': '模型对比功能未启用'}), 503

    data = request.get_json() or {}

    # 获取参数
    preset = data.get('preset')  # basic/standard/full
    models = data.get('models')  # ['nano', 'small', 'medium']
    epochs = data.get('epochs')  # [50, 100, 150]
    data_dir = data.get('data_dir', 'dataset_raw')
    augment = data.get('augment', True)
    imgsz = data.get('imgsz')  # [640, 800]

    try:
        result = comparison_api.start_comparison(
            preset=preset,
            models=models,
            epochs=epochs,
            data_dir=data_dir,
            augment=augment,
            imgsz=imgsz
        )

        if result.get('success'):
            add_log(f"模型对比任务已启动: {result['task_id']}", level='info')
            return jsonify(result)
        else:
            return jsonify(result), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/comparison/status/<task_id>', methods=['GET'])
def get_comparison_status(task_id: str):
    """获取对比任务状态"""
    if not COMPARISON_ENABLED:
        return jsonify({'error': '模型对比功能未启用'}), 503

    try:
        status = comparison_api.get_comparison_status(task_id)
        return jsonify(status)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/comparison/reports', methods=['GET'])
def list_comparison_reports():
    """列出所有对比报告"""
    if not COMPARISON_ENABLED:
        return jsonify({'error': '模型对比功能未启用'}), 503

    try:
        reports = comparison_api.list_comparison_reports()
        return jsonify({'reports': reports, 'count': len(reports)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/comparison/presets', methods=['GET'])
def get_comparison_presets():
    """获取预设模式信息"""
    presets = {
        'basic': {
            'name': '基础对比',
            'description': '快速对比2个模型，适合初步评估',
            'models': ['nano', 'small'],
            'epochs': [50],
            'imgsz': [640],
            'estimated_time': '30-60分钟',
            'experiments': 2
        },
        'standard': {
            'name': '标准对比',
            'description': '对比3个模型和2种轮数，平衡速度和全面性',
            'models': ['nano', 'small', 'medium'],
            'epochs': [50, 100],
            'imgsz': [640],
            'estimated_time': '2-4小时',
            'experiments': 6
        },
        'full': {
            'name': '完整对比',
            'description': '全面对比4个模型、3种轮数和2种尺寸',
            'models': ['nano', 'small', 'medium', 'large'],
            'epochs': [50, 100, 150],
            'imgsz': [640, 800],
            'estimated_time': '1-2天',
            'experiments': 24
        }
    }
    return jsonify(presets)


# ============== 主函数 ==============

def parse_args():
    parser = argparse.ArgumentParser(description='训练服务API')
    parser.add_argument('--port', type=int, default=5001, help='服务端口')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='服务地址')
    return parser.parse_args()


# ============== 音频训练相关API ==============

@app.route('/api/train/audio', methods=['POST'])
def train_audio_model():
    """音频模型训练"""
    try:
        data = request.json
        dataset_id = data.get('dataset_id')
        config = data.get('config', {})

        if not dataset_id:
            raise APIError("缺少dataset_id参数")

        # 读取数据集
        dataset_dir = BASE_DIR / 'datasets' / dataset_id
        if not dataset_dir.exists():
            raise APIError(f"数据集 {dataset_id} 不存在")

        metadata_path = dataset_dir / 'metadata.json'
        with open(metadata_path, 'r', encoding='utf-8') as f:
            metadata = json.load(f)

        # 验证是音频数据集
        if metadata.get('datasetType') != 'audio':
            raise APIError("该数据集不是音频数据集")

        # 创建训练任务
        task_id = f"audio_train_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        run_dir = RUNS_DIR / task_id
        run_dir.mkdir(parents=True, exist_ok=True)

        # 提取配置参数
        contamination = config.get('contamination', 0.45)
        feature_selection = config.get('featureSelection', 'hybrid')
        top_features = config.get('topFeatures', 15)
        use_enhanced = config.get('useEnhancedFeatures', True)

        # 启动训练线程
        def train_audio_worker():
            global training_state
            try:
                update_training_state(
                    is_training=True,
                    task_id=task_id,
                    progress=0,
                    status='preparing',
                    start_time=datetime.now().isoformat(),
                    config=config
                )

                add_log("开始音频模型训练", level='info')
                add_log(f"数据集: {dataset_id}", level='info')
                add_log(f"污染率: {contamination}", level='info')

                # 准备音频文件和标签
                audio_files = []
                labels = []
                audio_dir = dataset_dir / 'audios'

                for audio_info in metadata.get('audioFiles', []):
                    if not audio_info.get('isAnnotated', False):
                        continue

                    audio_path = audio_dir / audio_info['filename']
                    if audio_path.exists():
                        audio_files.append(str(audio_path))
                        # is_abnormal: True表示异常
                        labels.append(audio_info.get('anomalyType', 'normal') != 'normal')

                if len(audio_files) == 0:
                    raise APIError("没有标注的音频数据")

                add_log(f"找到 {len(audio_files)} 个标注的音频文件", level='info')

                update_training_state(progress=20, status='training')

                # 导入训练模块
                from audio_training.model_trainer import train_from_audio_files

                # 训练模型
                output_model = run_dir / 'audio_model.pkl'
                add_log("正在训练模型...", level='info')

                model_data = train_from_audio_files(
                    audio_files=audio_files,
                    labels=labels,
                    output_model=str(output_model),
                    contamination=contamination,
                    use_enhanced=use_enhanced
                )

                update_training_state(progress=90, status='completed')

                # 注册模型
                registry = load_models_registry()
                model_info = {
                    'id': task_id,
                    'name': f"音频异常检测_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                    'type': 'audio_anomaly',
                    'dataset_id': dataset_id,
                    'model_path': str(output_model),
                    'metrics': model_data.get('metrics', {}),
                    'config': config,
                    'created_at': datetime.now().isoformat()
                }
                registry['models'].append(model_info)
                save_models_registry(registry)

                update_training_state(progress=100, status='completed')
                add_log("训练完成!", level='success')

            except Exception as e:
                update_training_state(status='failed')
                add_log(f"训练失败: {str(e)}", level='error')
                import traceback
                traceback.print_exc()
            finally:
                update_training_state(is_training=False)

        thread = threading.Thread(target=train_audio_worker, daemon=True)
        thread.start()

        return api_response(data={'task_id': task_id}, message='音频训练任务已启动')

    except APIError as e:
        raise e
    except Exception as e:
        raise APIError(f"音频训练失败: {str(e)}")


@app.route('/api/audio/extract-features', methods=['POST'])
def extract_audio_features():
    """提取音频特征"""
    try:
        if 'audio' not in request.files:
            raise APIError("缺少音频文件")

        audio_file = request.files['audio']
        use_enhanced = request.form.get('enhanced', 'true').lower() == 'true'

        # 保存临时文件
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp:
            audio_file.save(temp.name)
            temp_path = temp.name

        try:
            from audio_training.feature_extraction import extract_features, extract_enhanced_features

            extract_fn = extract_enhanced_features if use_enhanced else extract_features
            features = extract_fn(temp_path)

            if features is None:
                raise APIError("特征提取失败")

            return api_response(data={'features': features})
        finally:
            Path(temp_path).unlink(missing_ok=True)

    except APIError as e:
        raise e
    except Exception as e:
        raise APIError(f"特征提取失败: {str(e)}")


@app.route('/api/audio/models', methods=['GET'])
def get_audio_models():
    """获取音频模型列表"""
    try:
        registry = load_models_registry()
        audio_models = [m for m in registry['models'] if m.get('type') == 'audio_anomaly']
        return api_response(data={'models': audio_models})
    except Exception as e:
        raise APIError(f"获取音频模型失败: {str(e)}")


@app.route('/api/audio/models/<model_id>/deploy', methods=['POST'])
def deploy_audio_model(model_id: str):
    """部署音频模型到听觉大师智能体"""
    try:
        # 加载注册表
        registry = load_models_registry()
        model_info = None

        # 查找目标模型
        for model in registry['models']:
            if model['id'] == model_id:
                if model.get('type') != 'audio_anomaly':
                    raise APIError('非音频模型，无法部署到听觉大师', code=400)
                model_info = model
                break

        if not model_info:
            raise APIError('模型不存在', code=404)

        # 检查模型文件是否存在
        source_path = Path(model_info['model_path'])
        if not source_path.exists():
            raise APIError('模型文件不存在', code=404)

        # 目标路径：听觉大师模型目录
        audio_model_dir = BASE_DIR.parent / 'model' / 'audio_models'
        audio_model_dir.mkdir(parents=True, exist_ok=True)
        target_path = audio_model_dir / 'deployed_model.pkl'

        # 备份原有模型
        if target_path.exists():
            backup_path = audio_model_dir / f'model_backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pkl'
            shutil.copy(target_path, backup_path)
            add_log(f"已备份原音频模型到: {backup_path.name}", level='info')

        # 复制新模型
        shutil.copy(source_path, target_path)
        add_log(f"音频模型已部署: {model_info['name']}", level='success')

        # 保存部署信息
        deploy_info_path = audio_model_dir / 'deploy_info.json'
        deploy_info = {
            'model_id': model_id,
            'model_name': model_info['name'],
            'deployed_at': datetime.now().isoformat(),
            'metrics': model_info.get('metrics', {}),
            'dataset_id': model_info.get('dataset_id', '')
        }
        with open(deploy_info_path, 'w', encoding='utf-8') as f:
            json.dump(deploy_info, f, ensure_ascii=False, indent=2)

        # 更新模型注册表，标记已部署
        for model in registry['models']:
            if model.get('type') == 'audio_anomaly':
                model['deployed'] = (model['id'] == model_id)
                if model['id'] == model_id:
                    model['deployed_at'] = datetime.now().isoformat()

        save_models_registry(registry)

        # 通知推理服务重新加载模型
        try:
            inference_url = 'http://localhost:5005'
            reload_response = requests.post(f'{inference_url}/api/audio/model/reload', timeout=5)
            if reload_response.status_code == 200:
                add_log("✅ 推理服务已重新加载模型", level='info')
            else:
                add_log(f"⚠️ 推理服务重载失败: {reload_response.text}", level='warning')
        except Exception as e:
            add_log(f"⚠️ 无法通知推理服务重载: {str(e)}", level='warning')

        return api_response(data={'message': '模型已成功部署到听觉大师智能体'})

    except APIError as e:
        raise e
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise APIError(f"部署失败: {str(e)}", code=500)


@app.route('/api/audio/detect', methods=['POST'])
def audio_detect_proxy():
    """音频检测代理端点（转发到推理服务，使用部署的模型）"""
    try:
        inference_url = 'http://localhost:5005'

        # 转发请求到推理服务（不需要model_id，直接使用部署的模型）
        files = {}
        if 'audio' in request.files:
            audio_file = request.files['audio']
            files['audio'] = (audio_file.filename, audio_file.stream, audio_file.content_type)

        response = requests.post(
            f'{inference_url}/api/audio/detect',
            files=files,
            timeout=30
        )

        return jsonify(response.json()), response.status_code

    except requests.exceptions.ConnectionError:
        return jsonify({
            'success': False,
            'error': '音频推理服务未启动，请启动 audio_inference_server.py (端口5005)'
        }), 503
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'检测失败: {str(e)}'
        }), 500


@app.route('/api/audio/evaluate/batch', methods=['POST'])
def evaluate_batch_audio():
    """音频批量评测（使用训练好的模型进行批量检测）"""
    try:
        data = request.get_json()

        if not data or 'audio_files' not in data:
            return jsonify({'success': False, 'error': '未提供音频文件列表'}), 400

        model_id = data.get('model_id')
        if not model_id:
            return jsonify({'success': False, 'error': '未指定模型'}), 400

        audio_files = data.get('audio_files', [])
        if len(audio_files) == 0:
            return jsonify({'success': False, 'error': '音频文件列表为空'}), 400

        # 查找模型（使用统一的模型注册表）
        registry = load_models_registry()
        model_info = None
        for m in registry.get('models', []):
            if m['id'] == model_id and m.get('type') == 'audio_anomaly':
                model_info = m
                break

        if not model_info:
            return jsonify({'success': False, 'error': '音频模型不存在'}), 404

        model_path = Path(model_info['model_path'])
        if not model_path.exists():
            return jsonify({'success': False, 'error': '模型文件不存在'}), 404

        # 加载模型
        from audio_training.audio_detector import AuscultationSystem
        detector = AuscultationSystem(str(model_path))

        # 批量处理
        results_list = []
        for idx, audio_data in enumerate(audio_files):
            try:
                # 解码音频文件
                audio_bytes = base64.b64decode(audio_data['audio'])

                # 保存到临时文件
                import tempfile
                with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp:
                    temp.write(audio_bytes)
                    temp_path = temp.name

                try:
                    # 检测
                    result = detector.detect(temp_path)

                    if result:
                        results_list.append({
                            'id': audio_data.get('id', f'audio_{idx}'),
                            'filename': audio_data.get('filename', f'audio_{idx}.wav'),
                            'is_abnormal': result['is_abnormal'],
                            'score': result['score'],
                            'status': result['status'],
                            'confidence': result['confidence'],
                            'level': result.get('level', 'UNKNOWN'),
                            'test_status': 'success'
                        })
                    else:
                        results_list.append({
                            'id': audio_data.get('id', f'audio_{idx}'),
                            'filename': audio_data.get('filename', f'audio_{idx}.wav'),
                            'is_abnormal': False,
                            'score': 0,
                            'status': '特征提取失败',
                            'confidence': 'N/A',
                            'level': 'ERROR',
                            'test_status': 'error',
                            'error': '无法提取音频特征'
                        })
                finally:
                    # 清理临时文件
                    Path(temp_path).unlink(missing_ok=True)

            except Exception as e:
                results_list.append({
                    'id': audio_data.get('id', f'audio_{idx}'),
                    'filename': audio_data.get('filename', f'audio_{idx}.wav'),
                    'is_abnormal': False,
                    'score': 0,
                    'status': '检测失败',
                    'confidence': 'N/A',
                    'level': 'ERROR',
                    'test_status': 'error',
                    'error': str(e)
                })

        # 统计
        total = len(results_list)
        success = sum(1 for r in results_list if r['test_status'] == 'success')
        abnormal_count = sum(1 for r in results_list if r.get('is_abnormal', False) and r['test_status'] == 'success')

        return jsonify({
            'success': True,
            'model': model_info['name'],
            'results': results_list,
            'summary': {
                'total_files': total,
                'success_count': success,
                'failed_count': total - success,
                'abnormal_count': abnormal_count,
                'normal_count': success - abnormal_count,
                'abnormal_rate': round(abnormal_count / success * 100, 2) if success > 0 else 0
            }
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'批量评测失败: {str(e)}'
        }), 500


if __name__ == '__main__':
    args = parse_args()

    # 确保目录存在
    RUNS_DIR.mkdir(exist_ok=True)

    # 初始化模型注册表
    if not MODELS_REGISTRY_FILE.exists():
        save_models_registry({'models': []})

    # 启动训练队列工作线程
    queue_worker = threading.Thread(target=training_queue_worker, daemon=True, name='TrainingQueueWorker')
    queue_worker.start()
    add_log("训练队列工作线程已启动", level='info')

    print(f"训练服务启动: http://{args.host}:{args.port}")
    print(f"基础目录: {BASE_DIR}")
    print(f"模型存储: {RUNS_DIR}")
    print(f"训练队列系统: 已启用")

    app.run(host=args.host, port=args.port, debug=False, threaded=True)

