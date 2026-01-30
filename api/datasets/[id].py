"""
数据集详情 - Vercel Serverless Function
GET /api/datasets/:id - 获取数据集详情
PUT /api/datasets/:id - 更新数据集
DELETE /api/datasets/:id - 删除数据集
"""
from http.server import BaseHTTPRequestHandler
import json
import os
from urllib.parse import urlparse
import re

# 尝试导入 Vercel Blob SDK
BLOB_AVAILABLE = False
try:
    from vercel_storage import blob
    BLOB_AVAILABLE = True
except ImportError:
    pass


def get_dataset_id(path):
    """从路径中提取数据集 ID"""
    # /api/datasets/abc123 -> abc123
    match = re.search(r'/api/datasets/([^/]+)', path)
    return match.group(1) if match else None


def get_dataset_from_blob(dataset_id):
    """从 Blob 获取数据集"""
    if not BLOB_AVAILABLE:
        return None
    
    try:
        content = blob.get(f'datasets/{dataset_id}/metadata.json')
        if content:
            return json.loads(content)
    except:
        pass
    return None


def delete_dataset_from_blob(dataset_id):
    """从 Blob 删除数据集"""
    if not BLOB_AVAILABLE:
        return False
    
    try:
        # 删除数据集目录下的所有文件
        blobs = blob.list(prefix=f'datasets/{dataset_id}/')
        for b in blobs.get('blobs', []):
            blob.delete(b['url'])
        return True
    except Exception as e:
        print(f"Error deleting dataset: {e}")
        return False


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """获取数据集详情"""
        dataset_id = get_dataset_id(self.path)
        if not dataset_id:
            self._send_error(400, '缺少数据集 ID')
            return
        
        try:
            if BLOB_AVAILABLE:
                dataset = get_dataset_from_blob(dataset_id)
                if not dataset:
                    self._send_error(404, '数据集不存在')
                    return
            else:
                # 返回模拟数据
                dataset = {
                    'id': dataset_id,
                    'name': f'数据集 {dataset_id}',
                    'description': 'Vercel Blob 未配置',
                    'images': [],
                    'stats': {'totalImages': 0, 'annotatedImages': 0}
                }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(dataset).encode())
            
        except Exception as e:
            self._send_error(500, str(e))

    def do_DELETE(self):
        """删除数据集"""
        dataset_id = get_dataset_id(self.path)
        if not dataset_id:
            self._send_error(400, '缺少数据集 ID')
            return
        
        try:
            if BLOB_AVAILABLE:
                success = delete_dataset_from_blob(dataset_id)
                if not success:
                    self._send_error(500, '删除失败')
                    return
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode())
            
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
        self.send_header('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
