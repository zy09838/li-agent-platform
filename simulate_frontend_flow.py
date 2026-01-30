import requests
import time
from pathlib import Path

# Configuration
YOLO_API_URL = "http://localhost:5000"
LLM_API_URL = "http://localhost:5005" # Updated to test port
TEST_DATA_DIR = Path("大模型调用测试/测试数据")

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}")

def test_yolo(image_path):
    log(f"Testing YOLO with {image_path.name}...")
    url = f"{YOLO_API_URL}/predict"
    try:
        with open(image_path, 'rb') as f:
            import base64
            encoded_string = base64.b64encode(f.read()).decode('utf-8')
            payload = {"image": encoded_string, "confidence_threshold": 0.5}
            
            response = requests.post(url, json=payload, timeout=10)
            if response.status_code == 200:
                log(f"✅ YOLO Success: {response.json().get('status')}")
            else:
                log(f"❌ YOLO Failed: {response.status_code} - {response.text}")
    except Exception as e:
        log(f"❌ YOLO Exception: {e}")

def test_llm(image_path):
    log(f"Testing LLM with {image_path.name}...")
    url = f"{LLM_API_URL}/api/llm/analyze-image"
    try:
        with open(image_path, 'rb') as f:
            files = {'image': ('inspection.jpg', f, 'image/jpeg')}
            # Note: Do NOT set Content-Type header manually for multipart/form-data
            
            response = requests.post(url, files=files, timeout=180)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    log(f"✅ LLM Success: Got analysis result.")
                    print(f"   Analysis Preview: str(data['data']['analysis'])[:50]...")
                else:
                    log(f"❌ LLM Logic Failure: {data.get('error')}")
            else:
                log(f"❌ LLM Http Failure: {response.status_code} - {response.text}")
                
    except Exception as e:
        log(f"❌ LLM Exception: {e}")

def main():
    if not TEST_DATA_DIR.exists():
        log(f"Test directory not found: {TEST_DATA_DIR}")
        return

    images = list(TEST_DATA_DIR.glob("*.jpg")) + list(TEST_DATA_DIR.glob("*.png"))
    if not images:
        log("No images found.")
        return

    log(f"Found {len(images)} images.")
    
    for img in images:
        print("-" * 50)
        test_yolo(img)
        test_llm(img)
        print("-" * 50)

if __name__ == "__main__":
    main()
