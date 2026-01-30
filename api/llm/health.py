"""
LLM 健康检查 - Vercel Serverless Function
GET /api/llm/health
"""
from http.server import BaseHTTPRequestHandler
import json
import requests
from datetime import datetime
import os

# LLM API 配置
BASE_URL = os.environ.get('LLM_BASE_URL', 'https://liai-app.chj.cloud/v1')
API_KEY = os.environ.get('LLM_API_KEY', 'app-1fPM2CPElfDesy1UNJAKTvAb')

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            headers = {
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json"
            }
            response = requests.get(f"{BASE_URL}/parameters", headers=headers, timeout=10)
            llm_online = response.status_code == 200

            result = {
                'success': True,
                'status': 'healthy' if llm_online else 'degraded',
                'llm_api_status': 'online' if llm_online else 'offline',
                'timestamp': datetime.now().isoformat()
            }

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())

        except Exception as e:
            result = {
                'success': False,
                'status': 'unhealthy',
                'error': str(e)
            }
            self.send_response(500)
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
