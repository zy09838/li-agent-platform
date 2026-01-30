#!/bin/bash
# 启动音频相关服务脚本

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "================================================"
echo "  🎵 智能体协作平台 - 音频服务启动脚本"
echo "================================================"
echo ""

# 检查是否已有服务在运行
if pgrep -f "audio_inference_server.py" > /dev/null; then
    echo "⚠️  音频推理服务已在运行"
else
    echo "🚀 启动音频推理服务 (端口 5005)..."
    python3 "$BASE_DIR/audio_inference_server.py" --port 5005 > "$BASE_DIR/audio_inference.log" 2>&1 &
    sleep 2
    if pgrep -f "audio_inference_server.py" > /dev/null; then
        echo "✅ 音频推理服务启动成功"
    else
        echo "❌ 音频推理服务启动失败，请查看 audio_inference.log"
    fi
fi

echo ""

if pgrep -f "train_server.py" > /dev/null; then
    echo "⚠️  训练服务已在运行"
else
    echo "🚀 启动训练服务 (端口 5001)..."
    python3 "$BASE_DIR/train_server.py" --port 5001 > "$BASE_DIR/train_server.log" 2>&1 &
    sleep 2
    if pgrep -f "train_server.py" > /dev/null; then
        echo "✅ 训练服务启动成功"
    else
        echo "❌ 训练服务启动失败，请查看 train_server.log"
    fi
fi

echo ""
echo "================================================"
echo "  📍 服务地址"
echo "================================================"
echo "  训练服务: http://localhost:5001"
echo "  音频推理: http://localhost:5005"
echo "  音频检测（代理）: http://localhost:5001/api/audio/detect"
echo ""
echo "  日志文件:"
echo "  - train_server.log"
echo "  - audio_inference.log"
echo "================================================"
