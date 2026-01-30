"""
LLM 图片分析 - Vercel Serverless Function
POST /api/llm/analyze-image
"""
from http.server import BaseHTTPRequestHandler
import json
import requests
import base64
from datetime import datetime
from pathlib import Path
import os
import cgi
from io import BytesIO

# LLM API 配置
BASE_URL = os.environ.get('LLM_BASE_URL', 'https://liai-app.chj.cloud/v1')
API_KEY = os.environ.get('LLM_API_KEY', 'app-1fPM2CPElfDesy1UNJAKTvAb')
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

DEFAULT_QUERY = """请作为一名专业的质检工程师，对这个产品零部件进行详细的外观质量检查。

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


def analyze_with_llm(file_id, query, mode="blocking"):
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
            content_length = int(self.headers.get('Content-Length', 0))

            file_bytes = None
            filename = 'image.jpg'
            query = DEFAULT_QUERY
            mode = 'blocking'

            if 'multipart/form-data' in content_type:
                # 处理 multipart 表单
                form = cgi.FieldStorage(
                    fp=self.rfile,
                    headers=self.headers,
                    environ={'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': content_type}
                )
                
                if 'image' in form:
                    file_item = form['image']
                    file_bytes = file_item.file.read()
                    filename = file_item.filename or 'image.jpg'
                
                if 'query' in form:
                    query = form['query'].value
                if 'mode' in form:
                    mode = form['mode'].value

            elif 'application/json' in content_type:
                # 处理 JSON
                body = self.rfile.read(content_length)
                data = json.loads(body)
                
                if 'image_base64' in data:
                    file_bytes = base64.b64decode(data['image_base64'])
                    filename = data.get('filename', 'image.jpg')
                
                query = data.get('query', DEFAULT_QUERY)
                mode = data.get('mode', 'blocking')

            if not file_bytes:
                self._send_error(400, '缺少图片数据')
                return

            # 上传文件
            upload_result = upload_file_to_llm(file_bytes, filename)
            if not upload_result['success']:
                self._send_error(500, f"文件上传失败: {upload_result['error']}")
                return

            file_id = upload_result['file_id']

            # LLM 分析
            analysis_result = analyze_with_llm(file_id, query, mode)
            if not analysis_result['success']:
                self._send_error(500, f"分析失败: {analysis_result['error']}")
                return

            result = {
                'success': True,
                'data': {
                    'file_id': file_id,
                    'analysis': analysis_result['answer'],
                    'metadata': analysis_result.get('metadata', {}),
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
