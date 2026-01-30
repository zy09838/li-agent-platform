#!/usr/bin/env python3
"""
数据集服务 API
提供数据集的文件系统持久化存储，包括原始图片和标注数据

启动方式：
    python dataset_server.py --port 5002
"""

import argparse
import json
import os
import shutil
import base64
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ============== 全局配置 ==============
BASE_DIR = Path(__file__).parent
DATASETS_DIR = BASE_DIR / 'datasets'  # 数据集根目录
DATASETS_DIR.mkdir(exist_ok=True)

# ============== 工具函数 ==============

def get_dataset_path(dataset_id: str) -> Path:
    """获取数据集目录路径"""
    return DATASETS_DIR / dataset_id

def get_dataset_metadata_path(dataset_id: str) -> Path:
    """获取数据集元信息文件路径"""
    return get_dataset_path(dataset_id) / 'metadata.json'

def get_dataset_images_dir(dataset_id: str) -> Path:
    """获取数据集图片目录"""
    return get_dataset_path(dataset_id) / 'images'

def get_dataset_annotations_dir(dataset_id: str) -> Path:
    """获取数据集标注目录"""
    return get_dataset_path(dataset_id) / 'annotations'

def load_dataset_metadata(dataset_id: str) -> Optional[Dict]:
    """加载数据集元信息"""
    metadata_path = get_dataset_metadata_path(dataset_id)
    if not metadata_path.exists():
        return None
    try:
        with open(metadata_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading dataset metadata: {e}")
        return None

def save_dataset_metadata(dataset_id: str, metadata: Dict):
    """保存数据集元信息"""
    dataset_path = get_dataset_path(dataset_id)
    dataset_path.mkdir(parents=True, exist_ok=True)
    
    metadata_path = get_dataset_metadata_path(dataset_id)
    with open(metadata_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

def list_all_datasets() -> List[Dict]:
    """列出所有数据集"""
    datasets = []
    if not DATASETS_DIR.exists():
        return datasets
    
    for dataset_dir in DATASETS_DIR.iterdir():
        if dataset_dir.is_dir():
            metadata = load_dataset_metadata(dataset_dir.name)
            if metadata:
                datasets.append(metadata)
    
    # 按更新时间排序
    datasets.sort(key=lambda x: x.get('updatedAt', ''), reverse=True)
    return datasets

def decode_base64_image(base64_str: str) -> bytes:
    """解码 base64 图片"""
    # 移除 data:image/xxx;base64, 前缀
    if ',' in base64_str:
        base64_str = base64_str.split(',', 1)[1]
    return base64.b64decode(base64_str)

def get_image_extension(filename: str, base64_str: str = None) -> str:
    """获取图片扩展名"""
    # 优先从文件名获取
    if '.' in filename:
        ext = filename.rsplit('.', 1)[1].lower()
        if ext in ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp']:
            return ext
    
    # 从 base64 头部获取
    if base64_str and base64_str.startswith('data:image/'):
        mime_type = base64_str.split(';')[0].split('/')[1]
        if mime_type == 'jpeg':
            return 'jpg'
        return mime_type
    
    return 'jpg'  # 默认

# ============== API 路由 ==============

@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({
        'status': 'ok',
        'service': 'dataset-server',
        'datasets_count': len(list_all_datasets())
    })

@app.route('/datasets', methods=['GET'])
def get_datasets():
    """获取所有数据集列表"""
    datasets = list_all_datasets()
    return jsonify({
        'datasets': datasets,
        'total': len(datasets)
    })

@app.route('/datasets', methods=['POST'])
def create_dataset():
    """创建新数据集"""
    data = request.get_json()
    
    dataset_id = str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    
    metadata = {
        'id': dataset_id,
        'name': data.get('name', '未命名数据集'),
        'description': data.get('description', ''),
        'partCategory': data.get('partCategory', ''),
        'partCode': data.get('partCode', ''),
        'defectTypes': data.get('defectTypes', []),
        'images': [],
        'stats': {
            'totalImages': 0,
            'annotatedImages': 0,
            'unannotatedImages': 0,
            'completionRate': 0,
            'totalAnnotations': 0,
            'defectDistribution': {}
        },
        'createdAt': now,
        'updatedAt': now
    }
    
    # 创建目录结构
    dataset_path = get_dataset_path(dataset_id)
    dataset_path.mkdir(parents=True, exist_ok=True)
    get_dataset_images_dir(dataset_id).mkdir(exist_ok=True)
    get_dataset_annotations_dir(dataset_id).mkdir(exist_ok=True)
    
    save_dataset_metadata(dataset_id, metadata)
    
    print(f"✅ 数据集创建成功: {metadata['name']} ({dataset_id})")
    
    return jsonify({
        'message': '数据集创建成功',
        'dataset': metadata
    })

@app.route('/datasets/<dataset_id>', methods=['GET'])
def get_dataset(dataset_id: str):
    """获取单个数据集详情"""
    metadata = load_dataset_metadata(dataset_id)
    if not metadata:
        return jsonify({'error': '数据集不存在'}), 404
        
    # 检查是否需要包含完整标注数据
    include_annotations = request.args.get('include_annotations', 'false').lower() == 'true'
    
    if include_annotations:
        # 为每张图片加载标注
        annotations_dir = get_dataset_annotations_dir(dataset_id)
        for img in metadata.get('images', []):
            if img.get('isAnnotated'):
                ann_path = annotations_dir / f"{img['id']}.json"
                if ann_path.exists():
                    try:
                        with open(ann_path, 'r', encoding='utf-8') as f:
                            ann_data = json.load(f)
                            img['annotations'] = ann_data.get('annotations', [])
                            img['masks'] = ann_data.get('masks', [])
                    except:
                        pass
    
    return jsonify(metadata)

@app.route('/datasets/<dataset_id>', methods=['PUT'])
def update_dataset(dataset_id: str):
    """更新数据集信息"""
    metadata = load_dataset_metadata(dataset_id)
    if not metadata:
        return jsonify({'error': '数据集不存在'}), 404
    
    data = request.get_json()
    
    # 更新允许修改的字段
    for key in ['name', 'description', 'partCategory', 'partCode', 'defectTypes']:
        if key in data:
            metadata[key] = data[key]
    
    metadata['updatedAt'] = datetime.now().isoformat()
    save_dataset_metadata(dataset_id, metadata)
    
    return jsonify({
        'message': '数据集更新成功',
        'dataset': metadata
    })

@app.route('/datasets/<dataset_id>', methods=['DELETE'])
def delete_dataset(dataset_id: str):
    """删除数据集（包括所有图片和标注）"""
    dataset_path = get_dataset_path(dataset_id)
    
    if not dataset_path.exists():
        return jsonify({'error': '数据集不存在'}), 404
    
    try:
        # 删除整个数据集目录
        shutil.rmtree(dataset_path)
        print(f"🗑️ 数据集已删除: {dataset_id}")
        return jsonify({'message': '数据集删除成功'})
    except Exception as e:
        return jsonify({'error': f'删除失败: {str(e)}'}), 500

@app.route('/datasets/<dataset_id>/images', methods=['POST'])
def add_images(dataset_id: str):
    """添加图片到数据集"""
    metadata = load_dataset_metadata(dataset_id)
    if not metadata:
        return jsonify({'error': '数据集不存在'}), 404
    
    data = request.get_json()
    images_data = data.get('images', [])
    
    if not images_data:
        return jsonify({'error': '没有提供图片数据'}), 400
    
    images_dir = get_dataset_images_dir(dataset_id)
    annotations_dir = get_dataset_annotations_dir(dataset_id)
    now = datetime.now().isoformat()
    
    added_images = []
    
    for img_data in images_data:
        image_id = str(uuid.uuid4())[:8]
        filename = img_data.get('filename', f'{image_id}.jpg')
        base64_url = img_data.get('url', '')
        
        # 确定文件扩展名
        ext = get_image_extension(filename, base64_url)
        safe_filename = f"{image_id}.{ext}"
        
        # 保存图片文件
        if base64_url:
            try:
                image_bytes = decode_base64_image(base64_url)
                image_path = images_dir / safe_filename
                with open(image_path, 'wb') as f:
                    f.write(image_bytes)
            except Exception as e:
                print(f"Error saving image {filename}: {e}")
                continue
        
        # 创建空的标注文件
        annotation_path = annotations_dir / f"{image_id}.json"
        with open(annotation_path, 'w', encoding='utf-8') as f:
            json.dump({
                'imageId': image_id,
                'annotations': [],
                'masks': []
            }, f, ensure_ascii=False, indent=2)
        
        # 添加图片元信息
        image_meta = {
            'id': image_id,
            'filename': filename,
            'storedFilename': safe_filename,
            'width': img_data.get('width', 0),
            'height': img_data.get('height', 0),
            'isAnnotated': False,
            'annotationCount': 0,
            'defectTypes': [],
            'createdAt': now,
            'updatedAt': now
        }
        
        metadata['images'].append(image_meta)
        added_images.append(image_meta)
    
    # 更新统计信息
    metadata['stats']['totalImages'] = len(metadata['images'])
    metadata['stats']['unannotatedImages'] = len([img for img in metadata['images'] if not img.get('isAnnotated')])
    metadata['stats']['annotatedImages'] = metadata['stats']['totalImages'] - metadata['stats']['unannotatedImages']
    metadata['stats']['completionRate'] = round(
        metadata['stats']['annotatedImages'] / metadata['stats']['totalImages'] * 100
    ) if metadata['stats']['totalImages'] > 0 else 0
    
    metadata['updatedAt'] = now
    save_dataset_metadata(dataset_id, metadata)
    
    print(f"📸 已添加 {len(added_images)} 张图片到数据集 {dataset_id}")
    
    return jsonify({
        'message': f'成功添加 {len(added_images)} 张图片',
        'images': added_images
    })

@app.route('/datasets/<dataset_id>/images/<image_id>', methods=['DELETE'])
def delete_image(dataset_id: str, image_id: str):
    """删除单张图片"""
    metadata = load_dataset_metadata(dataset_id)
    if not metadata:
        return jsonify({'error': '数据集不存在'}), 404
    
    # 查找图片
    image_meta = None
    for img in metadata['images']:
        if img['id'] == image_id:
            image_meta = img
            break
    
    if not image_meta:
        return jsonify({'error': '图片不存在'}), 404
    
    # 删除图片文件
    images_dir = get_dataset_images_dir(dataset_id)
    image_path = images_dir / image_meta.get('storedFilename', f"{image_id}.jpg")
    if image_path.exists():
        image_path.unlink()
    
    # 删除标注文件
    annotations_dir = get_dataset_annotations_dir(dataset_id)
    annotation_path = annotations_dir / f"{image_id}.json"
    if annotation_path.exists():
        annotation_path.unlink()
    
    # 更新元信息
    metadata['images'] = [img for img in metadata['images'] if img['id'] != image_id]
    
    # 重新计算统计
    metadata['stats']['totalImages'] = len(metadata['images'])
    metadata['stats']['unannotatedImages'] = len([img for img in metadata['images'] if not img.get('isAnnotated')])
    metadata['stats']['annotatedImages'] = metadata['stats']['totalImages'] - metadata['stats']['unannotatedImages']
    metadata['stats']['completionRate'] = round(
        metadata['stats']['annotatedImages'] / metadata['stats']['totalImages'] * 100
    ) if metadata['stats']['totalImages'] > 0 else 0
    
    metadata['updatedAt'] = datetime.now().isoformat()
    save_dataset_metadata(dataset_id, metadata)
    
    return jsonify({'message': '图片删除成功'})

@app.route('/datasets/<dataset_id>/images/<image_id>/file', methods=['GET'])
def get_image_file(dataset_id: str, image_id: str):
    """获取图片文件"""
    metadata = load_dataset_metadata(dataset_id)
    if not metadata:
        return jsonify({'error': '数据集不存在'}), 404
    
    # 查找图片
    image_meta = None
    for img in metadata['images']:
        if img['id'] == image_id:
            image_meta = img
            break
    
    if not image_meta:
        return jsonify({'error': '图片不存在'}), 404
    
    images_dir = get_dataset_images_dir(dataset_id)
    image_path = images_dir / image_meta.get('storedFilename', f"{image_id}.jpg")
    
    if not image_path.exists():
        return jsonify({'error': '图片文件不存在'}), 404
    
    return send_file(image_path)

@app.route('/datasets/<dataset_id>/images/<image_id>/annotations', methods=['GET'])
def get_annotations(dataset_id: str, image_id: str):
    """获取图片标注"""
    annotations_dir = get_dataset_annotations_dir(dataset_id)
    annotation_path = annotations_dir / f"{image_id}.json"
    
    if not annotation_path.exists():
        return jsonify({
            'imageId': image_id,
            'annotations': [],
            'masks': []
        })
    
    try:
        with open(annotation_path, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    except Exception as e:
        return jsonify({'error': f'读取标注失败: {str(e)}'}), 500

@app.route('/datasets/<dataset_id>/images/<image_id>/annotations', methods=['PUT'])
def save_annotations(dataset_id: str, image_id: str):
    """保存图片标注"""
    metadata = load_dataset_metadata(dataset_id)
    if not metadata:
        return jsonify({'error': '数据集不存在'}), 404
    
    data = request.get_json()
    annotations = data.get('annotations', [])
    masks = data.get('masks', [])
    defect_types = data.get('defectTypes', [])
    
    # 保存标注文件
    annotations_dir = get_dataset_annotations_dir(dataset_id)
    annotation_path = annotations_dir / f"{image_id}.json"
    
    annotation_data = {
        'imageId': image_id,
        'annotations': annotations,
        'masks': masks,
        'defectTypes': defect_types,
        'updatedAt': datetime.now().isoformat()
    }
    
    with open(annotation_path, 'w', encoding='utf-8') as f:
        json.dump(annotation_data, f, ensure_ascii=False, indent=2)
    
    # 更新图片元信息
    is_annotated = len(annotations) > 0 or len(masks) > 0
    annotation_count = len(annotations) + len(masks)
    
    for img in metadata['images']:
        if img['id'] == image_id:
            img['isAnnotated'] = is_annotated
            img['annotationCount'] = annotation_count
            img['defectTypes'] = defect_types
            img['updatedAt'] = datetime.now().isoformat()
            break
    
    # 重新计算统计
    metadata['stats']['annotatedImages'] = len([img for img in metadata['images'] if img.get('isAnnotated')])
    metadata['stats']['unannotatedImages'] = metadata['stats']['totalImages'] - metadata['stats']['annotatedImages']
    metadata['stats']['completionRate'] = round(
        metadata['stats']['annotatedImages'] / metadata['stats']['totalImages'] * 100
    ) if metadata['stats']['totalImages'] > 0 else 0
    metadata['stats']['totalAnnotations'] = sum(img.get('annotationCount', 0) for img in metadata['images'])
    
    # 统计缺陷分布
    defect_dist = {}
    for img in metadata['images']:
        for dt in img.get('defectTypes', []):
            defect_dist[dt] = defect_dist.get(dt, 0) + 1
    metadata['stats']['defectDistribution'] = defect_dist
    
    metadata['updatedAt'] = datetime.now().isoformat()
    save_dataset_metadata(dataset_id, metadata)
    
    return jsonify({'message': '标注保存成功'})

# ============== 导入默认数据功能 ==============

def auto_import_default_data():
    """自动导入默认数据的内部函数"""
    default_data_dir = BASE_DIR.parent / 'training' / 'dataset_raw'
    
    if not default_data_dir.exists():
        print(f"⚠️ 默认数据目录不存在: {default_data_dir}")
        return False, "默认数据目录不存在"
    
    images_dir = default_data_dir / 'images'
    annotations_dir = default_data_dir / 'annotations'
    
    if not images_dir.exists():
        return False, "默认数据缺少图片目录"

    # Step 1: Check if already exists
    dataset_name = "默认训练数据集"
    for ds in list_all_datasets():
        if ds['name'] == dataset_name:
            print("✅ 默认数据集已存在，跳过导入")
            return True, "已存在"
            
    # Step 2: Create Dataset
    dataset_id = str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    
    metadata = {
        'id': dataset_id,
        'name': dataset_name,
        'description': '包含系统预置的默认训练样本数据',
        'partCategory': 'unknown',
        'partCode': '-',
        'defectTypes': [],
        'images': [],
        'stats': {
            'totalImages': 0, 'annotatedImages': 0, 'unannotatedImages': 0,
            'completionRate': 0, 'totalAnnotations': 0, 'defectDistribution': {}
        },
        'createdAt': now,
        'updatedAt': now
    }
    
    # Create directories
    dataset_path = get_dataset_path(dataset_id)
    dataset_path.mkdir(parents=True, exist_ok=True)
    target_images_dir = get_dataset_images_dir(dataset_id)
    target_annotations_dir = get_dataset_annotations_dir(dataset_id)
    target_images_dir.mkdir(exist_ok=True)
    target_annotations_dir.mkdir(exist_ok=True)
    
    imported_count = 0
    all_defect_types = set()
    
    # Step 3: Import Images & Annotations
    for image_file in images_dir.glob('*'):
        if image_file.suffix.lower() not in ['.jpg', '.jpeg', '.png', '.bmp']:
            continue
            
        filename = image_file.name
        image_id = str(uuid.uuid4())[:8]
        safe_filename = f"{image_id}{image_file.suffix.lower()}"
        
        shutil.copy(image_file, target_images_dir / safe_filename)
        
        # Match annotation
        annotation_file = annotations_dir / f"{image_file.stem}.json"
        
        annotations = []
        masks = []
        defect_types = []
        is_annotated = False
        
        if annotation_file.exists():
            try:
                with open(annotation_file, 'r', encoding='utf-8') as f:
                    raw_data = json.load(f)
                
                if 'annotations' in raw_data:
                    for ann in raw_data['annotations']:
                        label = ann.get('label', 'unknown')
                        points = ann.get('points', [])
                        
                        if len(points) == 4:
                            all_defect_types.add(label)
                            if label not in defect_types:
                                defect_types.append(label)
                            
                            annotations.append({
                                "id": str(uuid.uuid4()),
                                "type": "bbox",
                                "label": label,
                                "color": ann.get('color', '#FF0000'),
                                "points": points,
                                "locked": False,
                                "visible": True
                            })
                    
                    if annotations:
                        is_annotated = True
            except Exception as e:
                print(f"Warning: Failed to parse annotation for {filename}: {e}")

        # Save annotation file
        with open(target_annotations_dir / f"{image_id}.json", 'w', encoding='utf-8') as f:
            json.dump({
                'imageId': image_id,
                'annotations': annotations,
                'masks': masks,
                'defectTypes': defect_types
            }, f, ensure_ascii=False, indent=2)
        
        # Get dimensions
        width, height = 0, 0
        try:
            from PIL import Image
            with Image.open(image_file) as img:
                width, height = img.size
        except:
            pass

        image_meta = {
            'id': image_id,
            'filename': filename,
            'storedFilename': safe_filename,
            'width': width, 'height': height,
            'isAnnotated': is_annotated,
            'annotationCount': len(annotations),
            'defectTypes': defect_types,
            'createdAt': now, 'updatedAt': now
        }
        metadata['images'].append(image_meta)
        imported_count += 1
        
    # Step 4: Update Stats
    metadata['defectTypes'] = list(all_defect_types)
    metadata['stats']['totalImages'] = len(metadata['images'])
    metadata['stats']['unannotatedImages'] = len([img for img in metadata['images'] if not img.get('isAnnotated')])
    metadata['stats']['annotatedImages'] = metadata['stats']['totalImages'] - metadata['stats']['unannotatedImages']
    metadata['stats']['completionRate'] = round(
        metadata['stats']['annotatedImages'] / metadata['stats']['totalImages'] * 100
    ) if metadata['stats']['totalImages'] > 0 else 0
    metadata['stats']['totalAnnotations'] = sum(img.get('annotationCount', 0) for img in metadata['images'])
    
    defect_dist = {}
    for img in metadata['images']:
        for dt in img.get('defectTypes', []):
            defect_dist[dt] = defect_dist.get(dt, 0) + 1
    metadata['stats']['defectDistribution'] = defect_dist
    
    save_dataset_metadata(dataset_id, metadata)
    print(f"✅ 成功导入默认数据集: {imported_count} 张图片")
    return True, metadata


@app.route('/datasets/import-default', methods=['POST'])
def import_default_dataset():
    """导入默认训练数据到数据集系统"""
    try:
        success, result = auto_import_default_data()
        if success:
            if result == "已存在":
                 # Find existing to return
                 for ds in list_all_datasets():
                    if ds['name'] == "默认训练数据集":
                         return jsonify({'error': '默认数据集已存在', 'dataset_id': ds['id']}), 400
            return jsonify({'success': True, 'message': '导入成功', 'dataset': result})
        else:
            return jsonify({'error': result}), 400
    except Exception as e:
        return jsonify({'error': f'导入失败: {str(e)}'}), 500

# ============== 音频数据集相关API ==============

@app.route('/api/datasets', methods=['GET'])
def get_api_datasets():
    """获取所有数据集列表 (API格式)"""
    try:
        datasets = list_all_datasets()
        return jsonify({
            'success': True,
            'data': datasets
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/datasets/<dataset_id>', methods=['GET'])
def get_api_dataset(dataset_id: str):
    """获取单个数据集详情 (API格式)"""
    try:
        metadata = load_dataset_metadata(dataset_id)
        if not metadata:
            return jsonify({
                'success': False,
                'error': '数据集不存在'
            }), 404
        return jsonify({
            'success': True,
            'data': metadata
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/datasets/<dataset_id>', methods=['DELETE'])
def delete_api_dataset(dataset_id: str):
    """删除数据集 (API格式)"""
    try:
        dataset_path = get_dataset_path(dataset_id)
        if not dataset_path.exists():
            return jsonify({
                'success': False,
                'error': '数据集不存在'
            }), 404
        
        import shutil
        shutil.rmtree(dataset_path)
        
        return jsonify({
            'success': True,
            'message': '数据集已删除'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


def get_dataset_audios_dir(dataset_id: str) -> Path:
    """获取数据集音频目录"""
    return get_dataset_path(dataset_id) / 'audios'


@app.route('/api/datasets/audio/create', methods=['POST'])
def create_audio_dataset():
    """创建音频数据集"""
    try:
        data = request.json
        dataset_id = str(uuid.uuid4())[:8]

        # 创建数据集目录结构
        dataset_path = get_dataset_path(dataset_id)
        dataset_path.mkdir(parents=True, exist_ok=True)

        audios_dir = get_dataset_audios_dir(dataset_id)
        audios_dir.mkdir(exist_ok=True)

        # 创建元数据
        metadata = {
            'id': dataset_id,
            'name': data.get('name', '未命名音频数据集'),
            'description': data.get('description', ''),
            'projectType': 'audio-anomaly',
            'datasetType': 'audio',
            'audioFiles': [],
            'stats': {
                'totalAudios': 0,
                'annotatedAudios': 0,
                'unannotatedAudios': 0,
                'totalDuration': 0,
                'averageDuration': 0,
                'completionRate': 0,
                'abnormalRatio': 0,
                'anomalyDistribution': {}
            },
            'createdAt': datetime.now().isoformat(),
            'updatedAt': datetime.now().isoformat()
        }

        save_dataset_metadata(dataset_id, metadata)

        return jsonify({
            'success': True,
            'data': metadata
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/datasets/<dataset_id>/upload-audio', methods=['POST'])
def upload_audio(dataset_id: str):
    """上传音频文件到数据集"""
    try:
        if 'audio' not in request.files:
            return jsonify({'success': False, 'error': '缺少音频文件'}), 400

        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({'success': False, 'error': '文件名为空'}), 400

        # 确保是 WAV 格式
        if not audio_file.filename.lower().endswith('.wav'):
            return jsonify({'success': False, 'error': '只支持 WAV 格式'}), 400

        # 加载元数据
        metadata = load_dataset_metadata(dataset_id)
        if not metadata:
            return jsonify({'success': False, 'error': '数据集不存在'}), 404

        if metadata.get('datasetType') != 'audio':
            return jsonify({'success': False, 'error': '该数据集不是音频数据集'}), 400

        # 保存音频文件
        audios_dir = get_dataset_audios_dir(dataset_id)
        audio_id = str(uuid.uuid4())[:8]
        filename = f"{audio_id}_{audio_file.filename}"
        audio_path = audios_dir / filename

        audio_file.save(str(audio_path))

        # 提取音频信息
        try:
            from audio_training.feature_extraction import get_audio_duration, get_audio_sample_rate
            duration = get_audio_duration(str(audio_path))
            sample_rate = get_audio_sample_rate(str(audio_path))
        except:
            duration = 0
            sample_rate = 0

        # 更新元数据
        audio_info = {
            'id': audio_id,
            'filename': filename,
            'url': f'/api/datasets/{dataset_id}/audios/{filename}',
            'duration': duration or 0,
            'sampleRate': sample_rate or 0,
            'isAnnotated': False,
            'anomalyType': 'normal',
            'severity': 'normal',
            'notes': '',
            'createdAt': datetime.now().isoformat(),
            'updatedAt': datetime.now().isoformat()
        }

        metadata['audioFiles'].append(audio_info)

        # 更新统计
        update_audio_dataset_stats(metadata)
        metadata['updatedAt'] = datetime.now().isoformat()

        save_dataset_metadata(dataset_id, metadata)

        return jsonify({
            'success': True,
            'data': audio_info
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/datasets/<dataset_id>/audios/<filename>')
def get_audio_file(dataset_id: str, filename: str):
    """获取音频文件"""
    try:
        audios_dir = get_dataset_audios_dir(dataset_id)
        audio_path = audios_dir / filename

        if not audio_path.exists():
            return jsonify({'success': False, 'error': '文件不存在'}), 404

        return send_file(str(audio_path), mimetype='audio/wav')
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/datasets/<dataset_id>/annotate-audio', methods=['POST'])
def annotate_audio(dataset_id: str):
    """标注音频 - 支持整体标注和时间区间精细化标注"""
    try:
        data = request.json
        audio_id = data.get('audioId')

        if not audio_id:
            return jsonify({'success': False, 'error': '缺少audioId'}), 400

        # 加载元数据
        metadata = load_dataset_metadata(dataset_id)
        if not metadata:
            return jsonify({'success': False, 'error': '数据集不存在'}), 404

        # 查找音频
        audio_file = None
        for af in metadata['audioFiles']:
            if af['id'] == audio_id:
                audio_file = af
                break

        if not audio_file:
            return jsonify({'success': False, 'error': '音频不存在'}), 404

        # 获取时间区间标注
        segments = data.get('segments', [])
        
        # 更新标注
        audio_file['isAnnotated'] = True
        audio_file['anomalyType'] = data.get('anomalyType', 'normal')
        audio_file['severity'] = data.get('severity', 'normal')
        audio_file['notes'] = data.get('notes', '')
        audio_file['segments'] = segments  # 保存时间区间标注
        audio_file['updatedAt'] = datetime.now().isoformat()

        # 更新统计
        update_audio_dataset_stats(metadata)
        metadata['updatedAt'] = datetime.now().isoformat()

        save_dataset_metadata(dataset_id, metadata)

        return jsonify({
            'success': True,
            'data': audio_file
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/datasets/<dataset_id>/audio-stats')
def get_audio_stats(dataset_id: str):
    """获取音频数据集统计信息"""
    try:
        metadata = load_dataset_metadata(dataset_id)
        if not metadata:
            return jsonify({'success': False, 'error': '数据集不存在'}), 404

        if metadata.get('datasetType') != 'audio':
            return jsonify({'success': False, 'error': '该数据集不是音频数据集'}), 400

        return jsonify({
            'success': True,
            'data': metadata['stats']
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def update_audio_dataset_stats(metadata: Dict):
    """更新音频数据集统计信息"""
    audio_files = metadata.get('audioFiles', [])

    total_audios = len(audio_files)
    annotated_audios = sum(1 for af in audio_files if af.get('isAnnotated', False))
    unannotated_audios = total_audios - annotated_audios

    total_duration = sum(af.get('duration', 0) for af in audio_files)
    average_duration = total_duration / total_audios if total_audios > 0 else 0

    completion_rate = (annotated_audios / total_audios * 100) if total_audios > 0 else 0

    # 异常比例
    abnormal_count = sum(1 for af in audio_files if af.get('isAnnotated') and af.get('anomalyType') != 'normal')
    abnormal_ratio = (abnormal_count / annotated_audios * 100) if annotated_audios > 0 else 0

    # 异常类型分布
    anomaly_distribution = {}
    for af in audio_files:
        if af.get('isAnnotated'):
            anomaly_type = af.get('anomalyType', 'normal')
            anomaly_distribution[anomaly_type] = anomaly_distribution.get(anomaly_type, 0) + 1

    metadata['stats'] = {
        'totalAudios': total_audios,
        'annotatedAudios': annotated_audios,
        'unannotatedAudios': unannotated_audios,
        'totalDuration': round(total_duration, 2),
        'averageDuration': round(average_duration, 2),
        'completionRate': round(completion_rate, 2),
        'abnormalRatio': round(abnormal_ratio, 2),
        'anomalyDistribution': anomaly_distribution
    }


@app.route('/api/datasets/audio/import-default', methods=['POST'])
def import_default_audio():
    """导入默认的测试音频文件"""
    try:
        # 音频文件目录
        audio_source_dir = BASE_DIR.parent / '听觉测试模型'
        
        if not audio_source_dir.exists():
            return jsonify({
                'success': False,
                'error': f'音频源目录不存在: {audio_source_dir}'
            }), 404
        
        # 查找以数字开头的 WAV 文件（正常测试音频）
        wav_files = [f for f in audio_source_dir.glob('*.wav') 
                     if f.name[0].isdigit()]
        
        if not wav_files:
            return jsonify({
                'success': False,
                'error': '没有找到符合条件的音频文件'
            }), 404
        
        # 创建默认音频数据集
        dataset_id = str(uuid.uuid4())[:8]
        dataset_path = get_dataset_path(dataset_id)
        dataset_path.mkdir(parents=True, exist_ok=True)
        
        audios_dir = get_dataset_audios_dir(dataset_id)
        audios_dir.mkdir(exist_ok=True)
        
        audio_files_list = []
        
        for wav_file in wav_files:
            audio_id = str(uuid.uuid4())[:8]
            filename = f"{audio_id}_{wav_file.name}"
            dest_path = audios_dir / filename
            
            # 复制文件
            shutil.copy2(str(wav_file), str(dest_path))
            
            # 提取音频信息
            try:
                from audio_training.feature_extraction import get_audio_duration, get_audio_sample_rate
                duration = get_audio_duration(str(dest_path))
                sample_rate = get_audio_sample_rate(str(dest_path))
            except:
                duration = 0
                sample_rate = 48000
            
            audio_info = {
                'id': audio_id,
                'filename': filename,
                'url': f'/api/datasets/{dataset_id}/audios/{filename}',
                'duration': duration or 0,
                'sampleRate': sample_rate or 48000,
                'isAnnotated': True,  # 默认标记为已标注-正常
                'anomalyType': 'normal',
                'severity': 'normal',
                'notes': '系统导入的正常测试音频',
                'createdAt': datetime.now().isoformat(),
                'updatedAt': datetime.now().isoformat()
            }
            audio_files_list.append(audio_info)
        
        # 创建元数据
        metadata = {
            'id': dataset_id,
            'name': '默认测试音频',
            'description': '系统导入的正常测试音频数据，可用于模型训练',
            'projectType': 'audio-anomaly',
            'datasetType': 'audio',
            'audioFiles': audio_files_list,
            'stats': {},
            'createdAt': datetime.now().isoformat(),
            'updatedAt': datetime.now().isoformat()
        }
        
        update_audio_dataset_stats(metadata)
        save_dataset_metadata(dataset_id, metadata)
        
        return jsonify({
            'success': True,
            'message': f'成功导入 {len(audio_files_list)} 个音频文件',
            'data': {
                'datasetId': dataset_id,
                'audioCount': len(audio_files_list)
            }
        })
        
    except Exception as e:
        print(f"导入默认音频失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ============== 启动服务 ==============

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='数据集服务')
    parser.add_argument('--port', type=int, default=5002, help='服务端口')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='服务地址')
    args = parser.parse_args()

    print(f"📁 数据集存储目录: {DATASETS_DIR}")

    # 自动尝试导入默认数据
    try:
        print("🔄 正在检查默认数据集...")
        auto_import_default_data()
    except Exception as e:
        print(f"⚠️ 自动导入默认数据失败: {e}")

    print(f"🚀 数据集服务启动在 http://{args.host}:{args.port}")

    app.run(host=args.host, port=args.port, debug=False)

