"""
YOLO 缺陷检测 - Vercel Serverless Function
POST /api/detect/predict

注意：此服务需要 Vercel Pro 版本以支持：
1. 更长的执行时间（60s）
2. 更大的部署包（ultralytics + opencv 约 200MB）

模型文件需要存储在 Vercel Blob Storage 中，首次调用时会下载到 /tmp
"""
from http.server import BaseHTTPRequestHandler
import json
import base64
import io
import os
import tempfile
import requests

# 尝试导入 ultralytics，如果失败则标记为不可用
YOLO_AVAILABLE = False
try:
    from ultralytics import YOLO
    from PIL import Image
    import numpy as np
    YOLO_AVAILABLE = True
except ImportError:
    pass

# 配置
MODEL_URL = os.environ.get('YOLO_MODEL_URL', '')  # Vercel Blob 中的模型 URL
MODEL_PATH = '/tmp/yolov8n.pt'
PART_TYPES = ['paint', 'electric_drive', 'glass']

# 全局模型缓存
_model_cache = {}


def ensure_model(part_type='paint'):
    """确保模型已加载"""
    global _model_cache
    
    if not YOLO_AVAILABLE:
        return None
    
    if part_type in _model_cache:
        return _model_cache[part_type]
    
    # 检查模型文件是否存在
    model_path = f'/tmp/model_{part_type}.pt'
    
    if not os.path.exists(model_path):
        # 从 Vercel Blob 下载模型
        model_url = os.environ.get(f'YOLO_MODEL_URL_{part_type.upper()}', MODEL_URL)
        if model_url:
            try:
                response = requests.get(model_url, timeout=30)
                if response.status_code == 200:
                    with open(model_path, 'wb') as f:
                        f.write(response.content)
            except Exception as e:
                print(f"Failed to download model: {e}")
                return None
        else:
            # 没有配置模型 URL，使用默认路径（本地开发）
            default_path = os.path.join(os.path.dirname(__file__), '..', '..', 'model', 'yolov8n.pt')
            if os.path.exists(default_path):
                model_path = default_path
            else:
                return None
    
    try:
        _model_cache[part_type] = YOLO(model_path)
        return _model_cache[part_type]
    except Exception as e:
        print(f"Failed to load model: {e}")
        return None


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not YOLO_AVAILABLE:
            self._send_error(503, 'YOLO 模型不可用，请检查依赖安装')
            return
        
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)
            
            if 'image' not in data:
                self._send_error(400, 'No image provided')
                return
            
            # 获取参数
            part_type = data.get('part_type', 'paint')
            if part_type not in PART_TYPES:
                part_type = 'paint'
            
            conf_threshold = data.get('confidence_threshold', 0.5)
            
            # 加载模型
            model = ensure_model(part_type)
            if model is None:
                self._send_error(500, f'零件类型 [{part_type}] 没有可用的模型')
                return
            
            # 解码图片
            image_data = base64.b64decode(data['image'])
            image = Image.open(io.BytesIO(image_data))
            
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # 推理
            results = model.predict(source=np.array(image), conf=conf_threshold, verbose=False)
            
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
            
            # 判断结果
            if len(detections) > 0:
                status = 'NG'
                issue = detected_classes[0] if detected_classes else 'Unknown Defect'
                confidence = f"{round(max_confidence * 100)}%"
            else:
                status = 'PASS'
                issue = 'None'
                confidence = '100%'
            
            result = {
                'status': status,
                'issue': issue,
                'confidence': confidence,
                'part_type': part_type,
                'detections': detections
            }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            self._send_error(500, str(e))

    def _send_error(self, code, message):
        result = {'error': message}
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
