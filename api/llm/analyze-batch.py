"""
LLM 批量图片分析 - Vercel Serverless Function
POST /api/llm/analyze-batch
"""
from http.server import BaseHTTPRequestHandler
import json
import requests
from datetime import datetime
from pathlib import Path
import os
import cgi

# LLM API 配置
BASE_URL = os.environ.get('LLM_BASE_URL', 'https://liai-app.chj.cloud/v1')
API_KEY = os.environ.get('LLM_API_KEY', 'app-1fPM2CPElfDesy1UNJAKTvAb')
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

DEFAULT_QUERY = "请对这个产品进行详细的质检分析，识别所有可能的瑕疵、缺陷和问题。"


def upload_file_to_llm(file_bytes, filename):
    """上传文件到LLM API"""
    try:
        url = f"{BASE_URL}/files/upload"
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
            return {'success': True, 'file_id': result['id'], 'size': result['size']}
        else:
            return {'success': False, 'error': f"HTTP {response.status_code}: {response.text}"}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def analyze_with_llm(file_id, query=DEFAULT_QUERY):
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
        "response_mode": "blocking",
        "user": "vision_master",
        "conversation_id": ""
    }

    try:
        response = requests.post(url, headers=HEADERS, json=payload, timeout=180)

        if response.status_code == 200:
            result = response.json()
            return {
                'success': True,
                'answer': result.get('answer', ''),
                'metadata': result.get('metadata', {})
            }
        else:
            return {'success': False, 'error': f"HTTP {response.status_code}: {response.text}"}
    except Exception as e:
        return {'success': False, 'error': str(e)}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_type = self.headers.get('Content-Type', '')

            if 'multipart/form-data' not in content_type:
                self._send_error(400, '需要 multipart/form-data 格式')
                return

            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': content_type}
            )

            # 获取所有图片文件
            images = form.getlist('images')
            if not images:
                self._send_error(400, '没有提供图片文件')
                return

            results = []
            for image_item in images:
                filename = image_item.filename or 'image.jpg'
                file_bytes = image_item.file.read()

                # 上传文件
                upload_result = upload_file_to_llm(file_bytes, filename)
                if not upload_result['success']:
                    results.append({
                        'filename': filename,
                        'success': False,
                        'error': upload_result['error']
                    })
                    continue

                # LLM 分析
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

            result = {
                'success': True,
                'data': {
                    'total': len(images),
                    'success': success_count,
                    'failed': len(images) - success_count,
                    'results': results,
                    'timestamp': datetime.now().isoformat()
                }
            }

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())

        except Exception as e:
            self._send_error(500, str(e))

    def _send_error(self, code, message):
        result = {'success': False, 'error': message}
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
