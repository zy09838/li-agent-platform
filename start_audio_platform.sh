#!/bin/bash
# 听觉异响检测模型整合 - 启动脚本

echo "========================================="
echo " 听觉异响检测平台启动脚本"
echo "========================================="
echo ""

# 切换到项目目录
cd "$(dirname "$0")"

# 检查Python依赖
echo "📦 检查Python依赖..."
pip install -q librosa numpy pandas scikit-learn scipy joblib flask flask-cors 2>/dev/null || {
    echo "⚠️ 部分Python包可能需要安装,请运行:"
    echo "   pip install librosa numpy pandas scikit-learn scipy joblib flask flask-cors"
}

# 创建必要的目录
mkdir -p training/runs
mkdir -p training/datasets
mkdir -p training/training_datasets

echo ""
echo "🚀 启动服务..."
echo ""

# 启动数据集服务 (端口 5002)
echo "📁 启动数据集服务 (端口 5002)..."
cd training
python dataset_server.py --port 5002 > ../logs/dataset_server.log 2>&1 &
DATASET_PID=$!
echo "   进程ID: $DATASET_PID"

# 等待服务启动
sleep 2

# 启动训练服务 (端口 5001)
echo "🎓 启动训练服务 (端口 5001)..."
python train_server.py --port 5001 > ../logs/train_server.log 2>&1 &
TRAIN_PID=$!
echo "   进程ID: $TRAIN_PID"

# 等待服务启动
sleep 2

# 启动音频检测服务 (端口 5003)
echo "🎵 启动音频检测服务 (端口 5003)..."
python audio_detection_server.py --port 5003 > ../logs/audio_server.log 2>&1 &
AUDIO_PID=$!
echo "   进程ID: $AUDIO_PID"

cd ..

# 等待服务启动
sleep 2

echo ""
echo "✅ 所有后端服务已启动!"
echo ""
echo "📋 服务信息:"
echo "   - 数据集服务: http://localhost:5002"
echo "   - 训练服务:   http://localhost:5001"
echo "   - 检测服务:   http://localhost:5003"
echo ""
echo "📝 进程ID:"
echo "   - 数据集服务: $DATASET_PID"
echo "   - 训练服务:   $TRAIN_PID"
echo "   - 检测服务:   $AUDIO_PID"
echo ""
echo "🌐 启动前端开发服务器..."
echo ""

# 启动前端
npm run dev

# 如果前端退出,清理后端进程
echo ""
echo "🛑 停止所有服务..."
kill $DATASET_PID $TRAIN_PID $AUDIO_PID 2>/dev/null
echo "✅ 所有服务已停止"
