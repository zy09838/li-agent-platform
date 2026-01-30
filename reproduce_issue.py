import requests
from pathlib import Path
import json

BASE_URL = "https://liai-app.chj.cloud/v1"
API_KEY = "app-1fPM2CPElfDesy1UNJAKTvAb"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
}

def test_png_as_jpg():
    # Find a png file
    png_files = list(Path('.').rglob('*.png'))
    if not png_files:
        print("No PNG files found.")
        return

    file_path = png_files[0]
    print(f"Testing with file: {file_path}")

    # Mimic frontend behavior: upload as inspection.jpg
    url = f"{BASE_URL}/files/upload"
    
    with open(file_path, 'rb') as f:
        files = {'file': ('inspection.jpg', f, 'image/jpeg')} 
        data = {'user': 'vision_master'}
        headers = {"Authorization": f"Bearer {API_KEY}"}

        print("Uploading PNG as inspection.jpg...")
        try:
            response = requests.post(url, headers=headers, files=files, data=data, timeout=30)
            print(f"Upload Status Code: {response.status_code}")
            
            if response.status_code not in [200, 201]:
                print(f"Upload Failed: {response.text}")
                return

            print("Upload success.")
            file_id = response.json().get('id')
            print(f"File ID: {file_id}")
            analyze(file_id)

        except Exception as e:
            print(f"Exception: {e}")

def analyze(file_id):
    print("Starting Analysis...")
    url = f"{BASE_URL}/chat-messages"
    inputs = {
        "doc_name": {
            "transfer_method": "local_file",
            "upload_file_id": file_id,
            "type": "image"
        }
    }
    payload = {
        "query": "Describe this image",
        "inputs": inputs,
        "response_mode": "blocking",
        "user": "vision_master",
        "conversation_id": ""
    }
    
    resp = requests.post(url, headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}, json=payload)
    print(f"Analysis Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"Analysis Failed: {resp.text}")
        print("FAILURE REPRODUCED: Upload worked but Analysis failed (likely due to file format mismatch).")
    else:
        print("Analysis Success!")
        print(resp.json().get('answer')[:100] + "...")

if __name__ == "__main__":
    test_png_as_jpg()
