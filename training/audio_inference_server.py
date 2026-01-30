#!/usr/bin/env python3
"""
音频异常检测推理服务
直接使用部署目录中的模型进行推理
"""

import argparse
import json
import os
import tempfile
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# 全局配置
BASE_DIR = Path(__file__).parent
DEPLOYED_MODEL_DIR = BASE_DIR.parent / 'model' / 'audio_models'
DEPLOYED_MODEL_PATH = DEPLOYED_MODEL_DIR / 'deployed_model.pkl'
DEPLOY_INFO_PATH = DEPLOYED_MODEL_DIR / 'deploy_info.json'

# 加载的模型缓存
loaded_model = None


def load_deployed_model():
    """加载部署目录中的音频检测模型"""
    global loaded_model

    if not DEPLOYED_MODEL_PATH.exists():
        print(f"❌ 部署模型不存在: {DEPLOYED_MODEL_PATH}")
        return None

    try:
        from audio_training.audio_detector import AuscultationSystem
        print(f"🔄 正在加载部署模型: {DEPLOYED_MODEL_PATH}")
        system = AuscultationSystem(str(DEPLOYED_MODEL_PATH))
        loaded_model = system
        print(f"✅ 模型加载成功")

        # 读取部署信息
        if DEPLOY_INFO_PATH.exists():
            with open(DEPLOY_INFO_PATH, 'r', encoding='utf-8') as f:
                deploy_info = json.load(f)
                print(f"📋 部署信息:")
                print(f"   模型名称: {deploy_info.get('model_name', 'N/A')}")
                print(f"   部署时间: {deploy_info.get('deployed_at', 'N/A')}")
                print(f"   准确率: {deploy_info.get('metrics', {}).get('accuracy', 'N/A')}")

        return system
    except Exception as e:
        print(f"❌ 模型加载失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return None


@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    model_status = 'loaded' if loaded_model else 'not_loaded'
    return jsonify({
        'status': 'ok',
        'service': 'audio-inference-server',
        'model_status': model_status,
        'model_path': str(DEPLOYED_MODEL_PATH) if DEPLOYED_MODEL_PATH.exists() else None
    })


@app.route('/api/audio/detect', methods=['POST'])
def detect_audio():
    """检测单个音频文件（使用部署的模型）"""
    try:
        if 'audio' not in request.files:
            return jsonify({'success': False, 'error': '缺少音频文件'}), 400

        audio_file = request.files['audio']

        # 检查模型是否加载
        if not loaded_model:
            return jsonify({
                'success': False,
                'error': '模型未加载，请先在训练中心部署模型'
            }), 503

        # 保存临时文件
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp:
            audio_file.save(temp.name)
            temp_path = temp.name

        try:
            # 检测
            print(f"🔍 正在检测音频: {audio_file.filename}")
            result = loaded_model.detect(temp_path)

            if result is None:
                return jsonify({
                    'success': False,
                    'error': '检测失败，无法提取音频特征'
                }), 500

            print(f"✅ 检测完成: {result}")
            return jsonify({'success': True, 'data': result})

        finally:
            # 清理临时文件
            Path(temp_path).unlink(missing_ok=True)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/audio/batch-detect', methods=['POST'])
def batch_detect_audio():
    """批量检测音频文件（从文件路径）"""
    try:
        data = request.json
        audio_paths = data.get('audio_paths', [])

        if not loaded_model:
            return jsonify({
                'success': False,
                'error': '模型未加载'
            }), 503

        # 批量检测
        results = loaded_model.batch_detect(audio_paths)

        return jsonify({'success': True, 'data': {'results': results}})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/audio/model/info', methods=['GET'])
def get_model_info():
    """获取当前部署模型的信息"""
    try:
        if not loaded_model:
            return jsonify({
                'success': False,
                'error': '模型未加载'
            }), 503

        info = loaded_model.get_model_info()

        # 添加部署信息
        if DEPLOY_INFO_PATH.exists():
            with open(DEPLOY_INFO_PATH, 'r', encoding='utf-8') as f:
                deploy_info = json.load(f)
                info['deploy_info'] = deploy_info

        return jsonify({'success': True, 'data': info})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/audio/model/reload', methods=['POST'])
def reload_model():
    """重新加载模型（用于模型更新后热重载）"""
    try:
        global loaded_model
        loaded_model = None
        system = load_deployed_model()

        if system:
            return jsonify({
                'success': True,
                'message': '模型重新加载成功'
            })
        else:
            return jsonify({
                'success': False,
                'error': '模型加载失败'
            }), 500

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='音频推理服务')
    parser.add_argument('--port', type=int, default=5003, help='服务端口')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='服务地址')
    args = parser.parse_args()

    print("=" * 60)
    print("🎵 音频异常检测推理服务")
    print("=" * 60)
    print(f"📁 基础目录: {BASE_DIR}")
    print(f"📦 部署模型目录: {DEPLOYED_MODEL_DIR}")
    print(f"🔧 模型文件: {DEPLOYED_MODEL_PATH}")
    print("-" * 60)

    # 启动时加载模型
    load_deployed_model()

    print("-" * 60)
    print(f"🚀 服务启动在 http://{args.host}:{args.port}")
    print(f"📍 检测端点: http://{args.host}:{args.port}/api/audio/detect")
    print(f"💚 健康检查: http://{args.host}:{args.port}/health")
    print("=" * 60)

    app.run(host=args.host, port=args.port, debug=False)
