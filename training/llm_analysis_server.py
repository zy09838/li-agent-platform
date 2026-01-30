#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大模型分析服务 - 用于视觉大师的详细图片分析
提供基于LLM的深度质检分析功能
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import base64
import logging
from pathlib import Path
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== 配置 ====================
BASE_URL = "https://liai-app.chj.cloud/v1"
API_KEY = "app-1fPM2CPElfDesy1UNJAKTvAb"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# ==================== API交互函数 ====================
def upload_file_to_llm(file_bytes, filename):
    """上传文件到LLM API"""
    try:
        url = f"{BASE_URL}/files/upload"

        # 根据文件扩展名确定MIME类型
        ext = Path(filename).suffix.lower()
        mime_types = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        }
        mime_type = mime_types.get(ext, 'image/jpeg')

        files = {'file': (filename, file_bytes, mime_type)}
        data = {'user': 'vision_master'}
        headers = {"Authorization": f"Bearer {API_KEY}"}

        response = requests.post(url, headers=headers, files=files, data=data, timeout=60)

        if response.status_code in [200, 201]:
            result = response.json()
            logger.info(f"文件上传成功: {result['id']}")
            return {
                'success': True,
                'file_id': result['id'],
                'size': result['size']
            }
        else:
            logger.error(f"文件上传失败: HTTP {response.status_code}")
            return {
                'success': False,
                'error': f"HTTP {response.status_code}: {response.text}"
            }
    except Exception as e:
        logger.error(f"文件上传异常: {e}")
        return {'success': False, 'error': str(e)}

def analyze_with_llm(file_id, query="请对这个产品进行详细的质检分析，识别所有可能的瑕疵、缺陷和问题。", mode="blocking"):
    """使用LLM分析图片"""
    url = f"{BASE_URL}/chat-messages"

    inputs = {
        "doc_name": {
            "transfer_method": "local_file",
            "upload_file_id": file_id,
            "type": "image"
        }
    }

    payload = {
        "query": query,
        "inputs": inputs,
        "response_mode": mode,
        "user": "vision_master",
        "conversation_id": ""
    }

    try:
        if mode == "blocking":
            response = requests.post(url, headers=HEADERS, json=payload, timeout=180)

            if response.status_code == 200:
                result = response.json()
                logger.info("LLM分析完成")
                return {
                    'success': True,
                    'answer': result.get('answer', ''),
                    'metadata': result.get('metadata', {})
                }
            else:
                logger.error(f"LLM分析失败: HTTP {response.status_code}")
                return {
                    'success': False,
                    'error': f"HTTP {response.status_code}: {response.text}"
                }
        else:  # streaming mode
            response = requests.post(url, headers=HEADERS, json=payload, stream=True, timeout=180)

            if response.status_code == 200:
                full_answer = ""
                metadata = {}

                for line in response.iter_lines():
                    if line:
                        line_text = line.decode('utf-8')
                        if line_text.startswith('data: '):
                            try:
                                import json
                                data = json.loads(line_text[6:])
                                event = data.get('event', '')

                                if event == 'message':
                                    full_answer += data.get('answer', '')
                                elif event == 'message_end':
                                    metadata = data.get('metadata', {})
                            except json.JSONDecodeError:
                                continue

                return {
                    'success': True,
                    'answer': full_answer,
                    'metadata': metadata
                }
            else:
                return {
                    'success': False,
                    'error': f"HTTP {response.status_code}"
                }
    except Exception as e:
        logger.error(f"LLM分析异常: {e}")
        return {'success': False, 'error': str(e)}

# ==================== API端点 ====================
@app.route('/api/llm/health', methods=['GET'])
def health_check():
    """健康检查"""
    try:
        # 测试LLM API连接
        response = requests.get(f"{BASE_URL}/parameters", headers=HEADERS, timeout=10)
        llm_online = response.status_code == 200

        return jsonify({
            'success': True,
            'status': 'healthy' if llm_online else 'degraded',
            'llm_api_status': 'online' if llm_online else 'offline',
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'status': 'unhealthy',
            'error': str(e)
        }), 500

@app.route('/api/llm/analyze-image', methods=['POST'])
def analyze_image():
    """
    分析图片端点
    接收图片文件或base64，返回LLM分析结果
    """
    try:
        logger.info(f"Received request: Content-Type={request.content_type}")
        # 获取图片数据
        if 'image' in request.files:
            # 文件上传
            image_file = request.files['image']
            filename = image_file.filename
            file_bytes = image_file.read()
        elif request.is_json and 'image_base64' in request.json:
            # Base64数据
            image_base64 = request.json['image_base64']
            filename = request.json.get('filename', 'image.jpg')
            file_bytes = base64.b64decode(image_base64)
        else:
            return jsonify({
                'success': False,
                'error': '缺少图片数据'
            }), 400

        # 获取自定义查询（可选）
        query = None
        if request.is_json:
            query = request.json.get('query')
        
        if not query:
            query = request.form.get('query')
            
        if not query:
            query = """请作为一名专业的质检工程师，对这个产品零部件进行详细的外观质量检查。
            
    请分析图片并严格按照以下 JSON 格式输出结果（不要输出任何其他多余文本，只输出 JSON）：

    ```json
    {
      "inspection_result": {
        "detected_defects": [
          {
            "type": "缺陷类型 (中英文)",
            "location_guess": "大致位置",
            "visual_description": "视觉特征描述",
            "estimated_severity": "严重程度评估",
            "standard_reference": "参考标准",
            "verdict": "NG/OK/REVIEW"
          }
        ],
        "overall_conclusion": "最终结论 (合格/不合格)",
        "advice": "处理建议"
      }
    }
    ```"""

        mode = 'blocking'
        if request.is_json:
            mode = request.json.get('mode', 'blocking')
        else:
            mode = request.form.get('mode', 'blocking')

        logger.info(f"开始分析图片: {filename}")

        # 步骤1: 上传文件
        upload_result = upload_file_to_llm(file_bytes, filename)
        if not upload_result['success']:
            return jsonify({
                'success': False,
                'error': f"文件上传失败: {upload_result['error']}"
            }), 500

        file_id = upload_result['file_id']

        # 步骤2: LLM分析
        analysis_result = analyze_with_llm(file_id, query, mode)
        if not analysis_result['success']:
            return jsonify({
                'success': False,
                'error': f"分析失败: {analysis_result['error']}"
            }), 500

        # 返回结果
        return jsonify({
            'success': True,
            'data': {
                'file_id': file_id,
                'analysis': analysis_result['answer'],
                'metadata': analysis_result.get('metadata', {}),
                'timestamp': datetime.now().isoformat()
            }
        })

    except Exception as e:
        logger.error(f"分析图片异常: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/llm/analyze-batch', methods=['POST'])
def analyze_batch():
    """
    批量分析图片
    """
    try:
        files = request.files.getlist('images')
        if not files:
            return jsonify({
                'success': False,
                'error': '没有提供图片文件'
            }), 400

        results = []
        for image_file in files:
            filename = image_file.filename
            file_bytes = image_file.read()

            # 上传文件
            upload_result = upload_file_to_llm(file_bytes, filename)
            if not upload_result['success']:
                results.append({
                    'filename': filename,
                    'success': False,
                    'error': upload_result['error']
                })
                continue

            # LLM分析
            file_id = upload_result['file_id']
            analysis_result = analyze_with_llm(file_id)

            if analysis_result['success']:
                results.append({
                    'filename': filename,
                    'success': True,
                    'file_id': file_id,
                    'analysis': analysis_result['answer'],
                    'metadata': analysis_result.get('metadata', {})
                })
            else:
                results.append({
                    'filename': filename,
                    'success': False,
                    'error': analysis_result['error']
                })

        success_count = sum(1 for r in results if r['success'])

        return jsonify({
            'success': True,
            'data': {
                'total': len(files),
                'success': success_count,
                'failed': len(files) - success_count,
                'results': results,
                'timestamp': datetime.now().isoformat()
            }
        })

    except Exception as e:
        logger.error(f"批量分析异常: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ==================== 启动服务 ====================
if __name__ == '__main__':
    logger.info("="*70)
    logger.info("大模型分析服务启动")
    logger.info("="*70)
    logger.info(f"LLM API: {BASE_URL}")
    port = int(os.environ.get('PORT', 5004))
    logger.info(f"服务端口: {port}")
    logger.info("="*70)

    app.run(
        host='0.0.0.0',
        port=port,
        debug=False,
        threaded=True
    )
