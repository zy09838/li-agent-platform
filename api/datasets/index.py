"""
数据集服务 - Vercel Serverless Function
GET /api/datasets - 获取数据集列表
POST /api/datasets - 创建新数据集

注意：此服务需要配置 Vercel Blob Storage 或 Vercel KV
环境变量：
- BLOB_READ_WRITE_TOKEN: Vercel Blob 访问令牌
"""
from http.server import BaseHTTPRequestHandler
import json
import os
from datetime import datetime
import uuid

# 尝试导入 Vercel Blob SDK
BLOB_AVAILABLE = False
try:
    # 在 Vercel 环境中可用
    from vercel_storage import blob
    BLOB_AVAILABLE = True
except ImportError:
    pass


def get_datasets_from_blob():
    """从 Vercel Blob 获取数据集列表"""
    if not BLOB_AVAILABLE:
        return []
    
    try:
        # 列出所有数据集的 metadata
        blobs = blob.list(prefix='datasets/')
        datasets = []
        
        for b in blobs.get('blobs', []):
            if b['pathname'].endswith('metadata.json'):
                content = blob.get(b['url'])
                if content:
                    datasets.append(json.loads(content))
        
        datasets.sort(key=lambda x: x.get('updatedAt', ''), reverse=True)
        return datasets
    except Exception as e:
        print(f"Error listing datasets: {e}")
        return []


def create_dataset_in_blob(data):
    """在 Vercel Blob 中创建数据集"""
    if not BLOB_AVAILABLE:
        return None
    
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
            'completionRate': 0
        },
        'createdAt': now,
        'updatedAt': now
    }
    
    try:
        blob.put(
            f'datasets/{dataset_id}/metadata.json',
            json.dumps(metadata, ensure_ascii=False),
            {'contentType': 'application/json'}
        )
        return metadata
    except Exception as e:
        print(f"Error creating dataset: {e}")
        return None


# 模拟数据（当 Blob 不可用时使用）
MOCK_DATASETS = [
    {
        'id': 'demo001',
        'name': '示例数据集',
        'description': 'Vercel Blob Storage 未配置时的演示数据',
        'partCategory': 'paint',
        'defectTypes': ['scratch', 'dent'],
        'images': [],
        'stats': {'totalImages': 0, 'annotatedImages': 0, 'completionRate': 0},
        'createdAt': '2024-01-01T00:00:00',
        'updatedAt': '2024-01-01T00:00:00'
    }
]


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """获取数据集列表"""
        try:
            if BLOB_AVAILABLE:
                datasets = get_datasets_from_blob()
            else:
                datasets = MOCK_DATASETS
            
            result = {
                'datasets': datasets,
                'total': len(datasets),
                'blob_enabled': BLOB_AVAILABLE
            }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            self._send_error(500, str(e))

    def do_POST(self):
        """创建新数据集"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)
            
            if BLOB_AVAILABLE:
                metadata = create_dataset_in_blob(data)
                if metadata is None:
                    self._send_error(500, '创建数据集失败')
                    return
            else:
                # 模拟创建
                dataset_id = str(uuid.uuid4())[:8]
                now = datetime.now().isoformat()
                metadata = {
                    'id': dataset_id,
                    'name': data.get('name', '未命名数据集'),
                    'description': data.get('description', ''),
                    'images': [],
                    'stats': {'totalImages': 0, 'annotatedImages': 0, 'completionRate': 0},
                    'createdAt': now,
                    'updatedAt': now,
                    '_note': 'Vercel Blob 未配置，数据不会持久化'
                }
            
            self.send_response(201)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(metadata).encode())
            
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
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
