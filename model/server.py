"""
YOLO 缺陷检测 API 服务
Flask 后端，提供图片预测接口
支持按零件类型加载不同模型
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO
import base64
import io
import os
import json
from PIL import Image
import numpy as np
from datetime import datetime

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 路径配置
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'yolov8n.pt')  # 默认/漆面模型
MODELS_DIR = os.path.join(BASE_DIR, 'models')  # 各零件类型模型目录
TRAINING_DIR = os.path.join(os.path.dirname(BASE_DIR), 'training')
MODELS_REGISTRY_FILE = os.path.join(TRAINING_DIR, 'models_registry.json')

# 支持的零件类型
PART_TYPES = ['paint', 'electric_drive', 'glass']

# 各零件类型的模型信息
part_models = {}
part_model_info = {}

def get_part_model_path(part_type: str) -> str:
    """获取指定零件类型的模型路径（只有明确部署的才返回）"""
    part_model_dir = os.path.join(MODELS_DIR, part_type)
    part_model_path = os.path.join(part_model_dir, 'model.pt')
    deploy_info_path = os.path.join(part_model_dir, 'deploy_info.json')
    
    # 只有同时存在模型文件和部署信息文件才算部署成功
    if os.path.exists(part_model_path) and os.path.exists(deploy_info_path):
        return part_model_path
    
    # 兼容旧版：漆面类型可以回退到 yolov8n.pt（如果有旧的部署记录）
    if part_type == 'paint' and os.path.exists(MODEL_PATH):
        # 检查模型注册表是否有漆面的部署记录
        try:
            if os.path.exists(MODELS_REGISTRY_FILE):
                with open(MODELS_REGISTRY_FILE, 'r') as f:
                    registry = json.load(f)
                    for model in registry.get('models', []):
                        # 有明确的漆面部署记录
                        if model.get('deployed') and model.get('deployed_part_type') == 'paint':
                            return MODEL_PATH
                        # 兼容旧的部署记录（没有 deployed_part_type 字段）
                        if model.get('deployed') and not model.get('deployed_part_type'):
                            return MODEL_PATH
        except:
            pass
    
    return None

def load_part_model_info(part_type: str) -> dict:
    """加载指定零件类型的部署信息"""
    deploy_info_path = os.path.join(MODELS_DIR, part_type, 'deploy_info.json')
    
    # 优先从 deploy_info.json 读取
    if os.path.exists(deploy_info_path):
        try:
            with open(deploy_info_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading deploy info for {part_type}: {e}")
    
    # 回退：从模型注册表读取（仅用于兼容旧版漆面部署）
    if part_type == 'paint':
        try:
            if os.path.exists(MODELS_REGISTRY_FILE):
                with open(MODELS_REGISTRY_FILE, 'r') as f:
                    registry = json.load(f)
                    for model in registry.get('models', []):
                        if model.get('deployed') and model.get('deployed_part_type') == part_type:
                            return {
                                'model_name': model.get('name', 'unknown'),
                                'model_id': model.get('id', 'unknown'),
                                'deployed_at': model.get('deployed_at'),
                                'metrics': model.get('metrics', {}),
                                'part_type': part_type
                            }
                        # 兼容旧的部署记录
                        if model.get('deployed') and not model.get('deployed_part_type'):
                            return {
                                'model_name': model.get('name', 'unknown'),
                                'model_id': model.get('id', 'unknown'),
                                'deployed_at': model.get('deployed_at'),
                                'metrics': model.get('metrics', {}),
                                'part_type': 'paint'
                            }
        except Exception as e:
            print(f"Error loading registry for {part_type}: {e}")
    
    return None

def load_model_for_part(part_type: str) -> bool:
    """加载指定零件类型的模型"""
    global part_models, part_model_info
    
    model_path = get_part_model_path(part_type)
    if not model_path:
        print(f"No model found for part type: {part_type}")
        part_models[part_type] = None
        part_model_info[part_type] = None
        return False
    
    try:
        print(f"Loading YOLO model for [{part_type}] from {model_path}...")
        part_models[part_type] = YOLO(model_path)
        part_model_info[part_type] = load_part_model_info(part_type)
        print(f"Model for [{part_type}] loaded successfully!")
        return True
    except Exception as e:
        print(f"Error loading model for {part_type}: {e}")
        part_models[part_type] = None
        part_model_info[part_type] = None
        return False

def load_all_models():
    """加载所有零件类型的模型"""
    for part_type in PART_TYPES:
        load_model_for_part(part_type)

# 初始化加载所有模型
load_all_models()

# 兼容旧版：全局默认模型
model = part_models.get('paint')
deployed_model_info = part_model_info.get('paint') or {
    'name': 'yolov8n',
    'version': 'default',
    'deployed_at': None
}


@app.route('/model/reload', methods=['POST'])
def reload_model():
    """重新加载模型（用于部署新模型后热重载）"""
    try:
        data = request.get_json() or {}
        part_type = data.get('part_type')
        
        if part_type:
            # 重载指定零件类型的模型
            if part_type not in PART_TYPES:
                return jsonify({'error': f'无效的零件类型: {part_type}'}), 400
            
            success = load_model_for_part(part_type)
            if success:
                info = part_model_info.get(part_type, {})
                return jsonify({
                    'message': f'模型 [{part_type}] 重新加载成功',
                    'part_type': part_type,
                    'model': info.get('model_name', 'unknown'),
                    'version': info.get('model_id', 'unknown')
                })
            else:
                return jsonify({'error': f'模型 [{part_type}] 重新加载失败'}), 500
        else:
            # 重载所有模型
            load_all_models()
            return jsonify({
                'message': '所有模型重新加载成功',
                'loaded_parts': [p for p in PART_TYPES if part_models.get(p) is not None]
            })
    except Exception as e:
        return jsonify({'error': f'重载失败: {str(e)}'}), 500


@app.route('/predict', methods=['POST'])
def predict():
    """
    接收 base64 编码的图片，返回检测结果
    
    Request JSON:
    {
        "image": "base64_encoded_image_data",
        "confidence_threshold": 0.5,  # 可选，默认 0.5
        "part_type": "paint"  # 可选，零件类型: paint, electric_drive, glass
    }
    
    Response JSON:
    {
        "status": "PASS" | "NG",
        "issue": "缺陷类型描述",
        "confidence": "98%",
        "part_type": "paint",
        "detections": [
            {
                "class": "Defect",
                "confidence": 0.98,
                "bbox": [x1, y1, x2, y2]
            }
        ]
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'image' not in data:
            return jsonify({'error': 'No image provided'}), 400
        
        # 获取零件类型，默认漆面
        part_type = data.get('part_type', 'paint')
        if part_type not in PART_TYPES:
            part_type = 'paint'
        
        # 获取对应零件类型的模型
        current_model = part_models.get(part_type)
        
        # 如果没有该类型的模型，尝试回退到漆面模型
        if current_model is None:
            current_model = part_models.get('paint')
            if current_model is None:
                return jsonify({'error': f'零件类型 [{part_type}] 没有可用的模型'}), 500
        
        # 解码 base64 图片
        image_data = base64.b64decode(data['image'])
        image = Image.open(io.BytesIO(image_data))
        
        # 转换为 RGB（防止 RGBA 或其他格式问题）
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # 获取置信度阈值
        conf_threshold = data.get('confidence_threshold', 0.5)
        
        # 运行推理
        results = current_model.predict(source=np.array(image), conf=conf_threshold, verbose=False)
        
        # 解析结果
        detections = []
        max_confidence = 0.0
        detected_classes = []
        
        for result in results:
            boxes = result.boxes
            if boxes is not None and len(boxes) > 0:
                for box in boxes:
                    cls_id = int(box.cls[0])
                    cls_name = result.names[cls_id]
                    conf = float(box.conf[0])
                    bbox = box.xyxy[0].tolist()
                    
                    detections.append({
                        'class': cls_name,
                        'confidence': round(conf, 3),
                        'bbox': [round(x, 2) for x in bbox]
                    })
                    
                    if conf > max_confidence:
                        max_confidence = conf
                    detected_classes.append(cls_name)
        
        # 判断 PASS / NG
        if len(detections) > 0:
            status = 'NG'
            # 取置信度最高的缺陷类型
            issue = detected_classes[0] if detected_classes else 'Unknown Defect'
            confidence = f"{round(max_confidence * 100)}%"
        else:
            status = 'PASS'
            issue = 'None'
            confidence = '100%'
        
        return jsonify({
            'status': status,
            'issue': issue,
            'confidence': confidence,
            'part_type': part_type,
            'detections': detections
        })
        
    except Exception as e:
        print(f"Prediction error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    """健康检查接口（支持查询指定零件类型）"""
    part_type = request.args.get('part_type')
    
    if part_type:
        # 返回指定零件类型的模型状态
        if part_type not in PART_TYPES:
            return jsonify({'error': f'无效的零件类型: {part_type}'}), 400
        
        model_obj = part_models.get(part_type)
        info = part_model_info.get(part_type)
        
        if model_obj is None:
            return jsonify({
                'status': 'no_model',
                'part_type': part_type,
                'message': f'零件类型 [{part_type}] 尚未部署模型'
            }), 404
        
        return jsonify({
            'status': 'ok',
            'part_type': part_type,
            'model': info.get('model_name', 'unknown') if info else 'unknown',
            'version': info.get('model_id', 'default') if info else 'default',
            'deployed_at': info.get('deployed_at') if info else None,
            'metrics': info.get('metrics', {}) if info else {}
        })
    
    # 返回所有零件类型的模型状态
    all_status = {}
    for pt in PART_TYPES:
        model_obj = part_models.get(pt)
        info = part_model_info.get(pt)
        all_status[pt] = {
            'available': model_obj is not None,
            'model': info.get('model_name', 'unknown') if info else None,
            'deployed_at': info.get('deployed_at') if info else None
        }
    
    return jsonify({
        'status': 'ok',
        'models': all_status
    })


@app.route('/model/info', methods=['GET'])
def model_info():
    """获取模型详细信息（支持指定零件类型）"""
    part_type = request.args.get('part_type', 'paint')
    
    if part_type not in PART_TYPES:
        return jsonify({'error': f'无效的零件类型: {part_type}'}), 400
    
    info = part_model_info.get(part_type)
    if not info:
        return jsonify({
            'part_type': part_type,
            'message': '该零件类型尚未部署模型'
        })
    
    return jsonify({
        'part_type': part_type,
        **info
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting YOLO API server on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=False)

