"""
YOLO 服务健康检查 - Vercel Serverless Function
GET /api/detect/health
"""
from http.server import BaseHTTPRequestHandler
import json
import os

# 检查依赖
YOLO_AVAILABLE = False
try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    pass

PART_TYPES = ['paint', 'electric_drive', 'glass']


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # 解析查询参数
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        part_type = params.get('part_type', [None])[0]
        
        if not YOLO_AVAILABLE:
            result = {
                'status': 'unavailable',
                'message': 'YOLO 依赖未安装',
                'yolo_available': False
            }
            self.send_response(503)
        elif part_type:
            if part_type not in PART_TYPES:
                result = {'error': f'无效的零件类型: {part_type}'}
                self.send_response(400)
            else:
                # 检查该类型的模型是否可用
                model_url = os.environ.get(f'YOLO_MODEL_URL_{part_type.upper()}', '')
                result = {
                    'status': 'ok' if model_url else 'no_model',
                    'part_type': part_type,
                    'model_configured': bool(model_url)
                }
                self.send_response(200 if model_url else 404)
        else:
            # 返回所有类型的状态
            all_status = {}
            for pt in PART_TYPES:
                model_url = os.environ.get(f'YOLO_MODEL_URL_{pt.upper()}', '')
                all_status[pt] = {
                    'available': bool(model_url),
                    'model_configured': bool(model_url)
                }
            
            result = {
                'status': 'ok',
                'yolo_available': YOLO_AVAILABLE,
                'models': all_status
            }
            self.send_response(200)
        
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
