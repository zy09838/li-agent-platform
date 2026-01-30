#!/usr/bin/env python3
"""
音频异常检测服务
提供模型加载和检测API
"""

import argparse
import json
import os
import tempfile
from pathlib import Path
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# 全局配置
BASE_DIR = Path(__file__).parent
MODELS_DIR = BASE_DIR / 'runs'
MODELS_REGISTRY_FILE = BASE_DIR / 'models_registry.json'

# 加载的模型缓存
loaded_models = {}


def load_model(model_id: str):
    """加载音频检测模型"""
    if model_id in loaded_models:
        return loaded_models[model_id]

    # 从注册表查找模型
    if MODELS_REGISTRY_FILE.exists():
        with open(MODELS_REGISTRY_FILE, 'r', encoding='utf-8') as f:
            registry = json.load(f)

        model_info = None
        for m in registry['models']:
            if m['id'] == model_id and m.get('type') == 'audio_anomaly':
                model_info = m
                break

        if model_info:
            from audio_training.audio_detector import AuscultationSystem
            model_path = model_info['model_path']
            system = AuscultationSystem(model_path)
            loaded_models[model_id] = system
            return system

    return None


@app.route('/api/audio/detect', methods=['POST'])
def detect_audio():
    """检测单个音频文件"""
    try:
        if 'audio' not in request.files:
            return jsonify({'success': False, 'error': '缺少音频文件'}), 400

        model_id = request.form.get('model_id')
        if not model_id:
            return jsonify({'success': False, 'error': '缺少model_id'}), 400

        audio_file = request.files['audio']

        # 加载模型
        system = load_model(model_id)
        if not system:
            return jsonify({'success': False, 'error': '模型不存在'}), 404

        # 保存临时文件
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp:
            audio_file.save(temp.name)
            temp_path = temp.name

        try:
            # 检测
            result = system.detect(temp_path)
            if result is None:
                return jsonify({'success': False, 'error': '检测失败'}), 500

            return jsonify({'success': True, 'data': result})
        finally:
            Path(temp_path).unlink(missing_ok=True)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/audio/batch-detect', methods=['POST'])
def batch_detect_audio():
    """批量检测音频文件"""
    try:
        data = request.json
        model_id = data.get('model_id')
        audio_paths = data.get('audio_paths', [])

        if not model_id:
            return jsonify({'success': False, 'error': '缺少model_id'}), 400

        # 加载模型
        system = load_model(model_id)
        if not system:
            return jsonify({'success': False, 'error': '模型不存在'}), 404

        # 批量检测
        results = system.batch_detect(audio_paths)

        return jsonify({'success': True, 'data': {'results': results}})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/audio/models/<model_id>/info')
def get_model_info(model_id: str):
    """获取模型信息"""
    try:
        system = load_model(model_id)
        if not system:
            return jsonify({'success': False, 'error': '模型不存在'}), 404

        info = system.get_model_info()
        return jsonify({'success': True, 'data': info})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/audio/models/<model_id>/deploy', methods=['POST'])
def deploy_model(model_id: str):
    """部署音频模型"""
    try:
        from datetime import datetime
        
        # 加载注册表
        if not MODELS_REGISTRY_FILE.exists():
            return jsonify({'success': False, 'error': '模型注册表不存在'}), 404
            
        with open(MODELS_REGISTRY_FILE, 'r', encoding='utf-8') as f:
            registry = json.load(f)
            
        model_found = False
        for model in registry['models']:
            if model['id'] == model_id:
                if model.get('type') != 'audio_anomaly':
                    return jsonify({'success': False, 'error': '非音频模型，无法部署到听觉大师'}), 400
                
                # 检查模型文件是否存在
                if not Path(model['model_path']).exists():
                    return jsonify({'success': False, 'error': '模型文件不存在'}), 404
                    
                model['deployed'] = True
                model['deployed_at'] = datetime.now().isoformat()
                model_found = True
            elif model.get('type') == 'audio_anomaly':
                # 取消如同类型其他模型的部署状态
                model['deployed'] = False
                
        if not model_found:
            return jsonify({'success': False, 'error': '模型不存在'}), 404
            
        # 保存注册表
        with open(MODELS_REGISTRY_FILE, 'w', encoding='utf-8') as f:
            json.dump(registry, f, ensure_ascii=False, indent=2)
            
        return jsonify({'success': True, 'message': '模型已部署到听觉大师'})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='音频检测服务')
    parser.add_argument('--port', type=int, default=5003, help='服务端口')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='服务地址')
    args = parser.parse_args()

    print(f"🎵 音频检测服务启动在 http://{args.host}:{args.port}")

    app.run(host=args.host, port=args.port, debug=False)
