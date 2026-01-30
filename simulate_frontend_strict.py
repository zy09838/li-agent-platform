import requests
import time
from pathlib import Path
import os

# Configuration
LLM_API_URL = "http://localhost:5004"
TEST_DATA_DIR = Path("大模型调用测试/测试数据")

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}")

def test_llm_strict(image_path):
    log(f"Testing LLM (Strict Mode) with {image_path.name}...")
    url = f"{LLM_API_URL}/api/llm/analyze-image"
    try:
        # Frontend: formData.append('image', blob, 'inspection.jpg');
        
        # Simulate exactly what the browser sends
        # Browser sends: Content-Type: multipart/form-data; boundary=----WebKitFormBoundary...
        # Requests does this automatically if we use 'files'.
        
        # Scenario 1: Standard upload (mimicking simulation script)
        with open(image_path, 'rb') as f:
            files = {'image': ('inspection.jpg', f, 'image/jpeg')}
            response = requests.post(url, files=files, timeout=60)
            if response.status_code == 200:
                log(f"✅ LLM Upload Success (Standard)")
            else:
                log(f"❌ LLM Upload Failed (Standard): {response.status_code} - {response.text}")
                
        # Scenario 2: With Query (mimicking frontend optional query)
        with open(image_path, 'rb') as f:
            files = {'image': ('inspection.jpg', f, 'image/jpeg')}
            data = {'query': 'Test Query'}
            response = requests.post(url, files=files, data=data, timeout=60)
            if response.status_code == 200:
                log(f"✅ LLM Upload + Query Success")
            else:
                log(f"❌ LLM Upload + Query Failed: {response.status_code} - {response.text}")

        # Scenario 3: Mixed (This often causes 415 if backend expects JSON)
        # Attempt to send JSON data with files? No, requests doesn't support that directly easily.
        # But what if the frontend *accidentally* sets Content-Type?
        # Let's try to force a failure.
        
        with open(image_path, 'rb') as f:
            headers = {"Content-Type": "application/json"}
            # This is INVALID for file upload but let's see what happens if we TRY
            # If we send raw bytes but claim it is JSON?
            try:
                response = requests.post(url, data=f, headers=headers, timeout=10)
                log(f"⚠️  Force JSON Header Result: {response.status_code} (Expected 400 or 415)")
            except:
                pass

    except Exception as e:
        log(f"❌ LLM Exception: {e}")

def main():
    images = list(TEST_DATA_DIR.glob("*.jpg"))
    if not images:
        log("No images found.")
        return
        
    for img in images[:1]:
        test_llm_strict(img)

if __name__ == "__main__":
    main()
