"""
音频异常检测 - Vercel Serverless Function
POST /api/audio/detect

注意：
1. 音频检测模型需要存储在 Vercel Blob Storage 中
2. 依赖 librosa, scikit-learn 等包
3. 推荐使用 Vercel Pro 版本以支持更长执行时间
"""
from http.server import BaseHTTPRequestHandler
import json
import os
import tempfile
import cgi

# 检查依赖
AUDIO_AVAILABLE = False
try:
    import librosa
    import numpy as np
    import joblib
    AUDIO_AVAILABLE = True
except ImportError:
    pass

# 模型缓存
_model_cache = {}


def load_audio_model(model_id):
    """加载音频检测模型"""
    global _model_cache
    
    if model_id in _model_cache:
        return _model_cache[model_id]
    
    # 从环境变量获取模型 URL
    model_url = os.environ.get(f'AUDIO_MODEL_URL_{model_id}', '')
    if not model_url:
        model_url = os.environ.get('AUDIO_MODEL_URL', '')
    
    if not model_url:
        return None
    
    try:
        import requests
        model_path = f'/tmp/audio_model_{model_id}.pkl'
        
        if not os.path.exists(model_path):
            response = requests.get(model_url, timeout=30)
            if response.status_code == 200:
                with open(model_path, 'wb') as f:
                    f.write(response.content)
        
        model = joblib.load(model_path)
        _model_cache[model_id] = model
        return model
    except Exception as e:
        print(f"Failed to load audio model: {e}")
        return None


def extract_features(audio_path):
    """提取音频特征"""
    try:
        y, sr = librosa.load(audio_path, sr=22050)
        
        # 基础特征
        features = {}
        
        # MFCC
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        features['mfcc_mean'] = np.mean(mfcc, axis=1).tolist()
        features['mfcc_std'] = np.std(mfcc, axis=1).tolist()
        
        # 频谱质心
        spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
        features['spectral_centroid_mean'] = float(np.mean(spectral_centroid))
        
        # 过零率
        zcr = librosa.feature.zero_crossing_rate(y)
        features['zcr_mean'] = float(np.mean(zcr))
        
        # RMS 能量
        rms = librosa.feature.rms(y=y)
        features['rms_mean'] = float(np.mean(rms))
        
        return features
    except Exception as e:
        print(f"Feature extraction error: {e}")
        return None


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not AUDIO_AVAILABLE:
            self._send_error(503, '音频处理依赖未安装 (librosa, scikit-learn)')
            return
        
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
            
            # 获取参数
            model_id = form.getvalue('model_id')
            if not model_id:
                self._send_error(400, '缺少 model_id')
                return
            
            if 'audio' not in form:
                self._send_error(400, '缺少音频文件')
                return
            
            audio_file = form['audio']
            
            # 加载模型
            model = load_audio_model(model_id)
            if model is None:
                self._send_error(404, f'模型 {model_id} 不存在或未配置')
                return
            
            # 保存临时文件
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp:
                temp.write(audio_file.file.read())
                temp_path = temp.name
            
            try:
                # 提取特征
                features = extract_features(temp_path)
                if features is None:
                    self._send_error(500, '特征提取失败')
                    return
                
                # 构建特征向量（简化版，实际需要根据模型要求）
                feature_vector = np.array(
                    features['mfcc_mean'] + features['mfcc_std'] + 
                    [features['spectral_centroid_mean'], features['zcr_mean'], features['rms_mean']]
                ).reshape(1, -1)
                
                # 预测
                prediction = model.predict(feature_vector)[0]
                
                # 如果模型支持概率预测
                try:
                    proba = model.predict_proba(feature_vector)[0]
                    confidence = float(max(proba))
                except:
                    confidence = 1.0
                
                result = {
                    'success': True,
                    'data': {
                        'is_anomaly': bool(prediction == 1),
                        'label': 'anomaly' if prediction == 1 else 'normal',
                        'confidence': confidence,
                        'features': features
                    }
                }
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
                
            finally:
                os.unlink(temp_path)
                
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
