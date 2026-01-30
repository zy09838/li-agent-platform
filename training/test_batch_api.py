#!/usr/bin/env python3
"""
测试批量评测API
"""
import requests
import json
import base64
from pathlib import Path

def test_batch_evaluation():
    """测试视觉批量评测API"""

    # 1. 获取模型列表
    print("1. 获取模型列表...")
    response = requests.get('http://localhost:5001/models')
    models_data = response.json()

    if not models_data.get('models'):
        print("❌ 没有可用的模型")
        return

    # 选择第一个模型
    model = models_data['models'][0]
    model_id = model['id']
    print(f"✅ 使用模型: {model['name']} (ID: {model_id})")

    # 2. 准备测试图片（创建一个小的测试图片）
    print("\n2. 准备测试数据...")

    # 创建一个简单的测试payload（空图片列表）
    test_data = {
        'model_id': model_id,
        'images': [],
        'confidence': 0.25
    }

    print(f"   模型ID: {model_id}")
    print(f"   图片数量: {len(test_data['images'])}")
    print(f"   置信度: {test_data['confidence']}")

    # 3. 发送批量测试请求
    print("\n3. 发送批量测试请求...")
    try:
        response = requests.post(
            'http://localhost:5001/evaluate/batch',
            json=test_data,
            timeout=30
        )

        print(f"   HTTP状态码: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            print(f"✅ 批量测试成功!")
            print(f"   模型: {result.get('model', 'N/A')}")
            print(f"   结果数量: {len(result.get('results', []))}")
            if 'summary' in result:
                summary = result['summary']
                print(f"   汇总统计:")
                print(f"     - 总图片数: {summary.get('total_images', 0)}")
                print(f"     - 成功数: {summary.get('success_count', 0)}")
                print(f"     - 失败数: {summary.get('failed_count', 0)}")
        else:
            print(f"❌ 请求失败: {response.status_code}")
            try:
                error_data = response.json()
                print(f"   错误信息: {error_data}")
            except:
                print(f"   响应内容: {response.text[:200]}")

    except requests.exceptions.ConnectionError:
        print("❌ 连接失败: 训练服务器未运行")
    except requests.exceptions.Timeout:
        print("❌ 请求超时")
    except Exception as e:
        print(f"❌ 错误: {str(e)}")

if __name__ == '__main__':
    print("=" * 50)
    print("批量评测API测试")
    print("=" * 50)
    test_batch_evaluation()
    print("\n" + "=" * 50)
