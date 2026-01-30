#!/bin/bash

# 理链智能体协作平台 - 一键启动脚本

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║   🚀 理链智能体协作平台 - 启动中...        ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查端口是否被占用
check_port() {
    lsof -i :$1 > /dev/null 2>&1
    return $?
}

# 等待服务启动
wait_for_service() {
    local url=$1
    local name=$2
    local max_attempts=10
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    return 1
}

# 检查 Python 环境
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ 错误: 未找到 python3，请先安装 Python 3.8+${NC}"
    exit 1
fi

# 检查 Node.js 环境
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ 错误: 未找到 npm，请先安装 Node.js${NC}"
    exit 1
fi

echo "📦 检查依赖..."

# 安装 Python 依赖 (静默模式)
pip3 install -q -r model/requirements.txt 2>/dev/null
pip3 install -q -r training/requirements.txt 2>/dev/null

# 安装 Node 依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装 Node.js 依赖..."
    npm install --silent
fi

echo ""

# ========== 启动 YOLO 推理服务 ==========
YOLO_PID=""
if check_port 5000; then
    echo -e "${YELLOW}⚡ YOLO 推理服务已在运行 (端口 5000)${NC}"
else
    echo "🤖 启动 YOLO 推理服务 (端口 5000)..."
    python3 model/server.py > /dev/null 2>&1 &
    YOLO_PID=$!
    
    if wait_for_service "http://localhost:5000/health" "YOLO"; then
        echo -e "${GREEN}✅ YOLO 推理服务启动成功${NC}"
    else
        echo -e "${YELLOW}⚠️  YOLO 推理服务启动中...${NC}"
    fi
fi

# ========== 启动训练服务 ==========
TRAIN_PID=""
if check_port 5001; then
    echo -e "${YELLOW}⚡ 训练服务已在运行 (端口 5001)${NC}"
else
    echo "🎯 启动模型训练服务 (端口 5001)..."
    python3 training/train_server.py --port 5001 > /dev/null 2>&1 &
    TRAIN_PID=$!
    
    if wait_for_service "http://localhost:5001/health" "Training"; then
        echo -e "${GREEN}✅ 训练服务启动成功${NC}"
    else
        echo -e "${YELLOW}⚠️  训练服务启动中...${NC}"
    fi
fi

# ========== 启动数据集服务 ==========
DATASET_PID=""
if check_port 5002; then
    echo -e "${YELLOW}⚡ 数据集服务已在运行 (端口 5002)${NC}"
else
    echo "📁 启动数据集服务 (端口 5002)..."
    python3 training/dataset_server.py --port 5002 > /dev/null 2>&1 &
    DATASET_PID=$!
    
    if wait_for_service "http://localhost:5002/health" "Dataset"; then
        echo -e "${GREEN}✅ 数据集服务启动成功${NC}"
    else
        echo -e "${YELLOW}⚠️  数据集服务启动中...${NC}"
    fi
fi

# ========== 启动音频检测服务 ==========
AUDIO_PID=""
if check_port 5003; then
    echo -e "${YELLOW}⚡ 音频检测服务已在运行 (端口 5003)${NC}"
else
    echo "🎵 启动音频检测服务 (端口 5003)..."
    python3 training/audio_detection_server.py --port 5003 > /dev/null 2>&1 &
    AUDIO_PID=$!
    
    sleep 2
    if check_port 5003; then
        echo -e "${GREEN}✅ 音频检测服务启动成功${NC}"
    else
        echo -e "${YELLOW}⚠️  音频检测服务启动中...${NC}"
    fi
fi

# ========== 启动大模型分析服务 ==========
LLM_PID=""
if check_port 5004; then
    echo -e "${YELLOW}⚡ 大模型分析服务已在运行 (端口 5004)${NC}"
else
    echo "🧠 启动大模型分析服务 (端口 5004)..."
    python3 training/llm_analysis_server.py > /dev/null 2>&1 &
    LLM_PID=$!
    
    if wait_for_service "http://localhost:5004/api/llm/health" "LLM"; then
        echo -e "${GREEN}✅ 大模型分析服务启动成功${NC}"
    else
        echo -e "${YELLOW}⚠️  大模型分析服务启动中...${NC}"
    fi
fi

echo ""

# ========== 启动前端服务 ==========
FRONTEND_PID=""
if check_port 3000; then
    echo -e "${YELLOW}⚡ 前端服务已在运行 (端口 3000)${NC}"
    echo ""
    echo "╔════════════════════════════════════════════╗"
    echo "║   ✅ 所有服务已就绪!                       ║"
    echo "╚════════════════════════════════════════════╝"
    echo ""
    echo "🌐 前端地址:      http://localhost:3000"
    echo "🤖 YOLO API:      http://localhost:5000"
    echo "🎯 训练服务 API:  http://localhost:5001"
    echo "📁 数据集 API:    http://localhost:5002"
    echo "🎵 音频检测 API:  http://localhost:5003"
    echo "🧠 大模型 API:    http://localhost:5004"
    echo ""
else
    echo "🌐 启动前端服务 (端口 3000)..."
    echo ""
    echo "╔════════════════════════════════════════════╗"
    echo "║   ✅ 平台启动完成!                         ║"
    echo "╚════════════════════════════════════════════╝"
    echo ""
    echo "🌐 前端地址:      http://localhost:3000"
    echo "🤖 YOLO API:      http://localhost:5000"
    echo "🎯 训练服务 API:  http://localhost:5001"
    echo "📁 数据集 API:    http://localhost:5002"
    echo "🎵 音频检测 API:  http://localhost:5003"
    echo "🧠 大模型 API:    http://localhost:5004"
    echo ""
    echo "按 Ctrl+C 停止所有服务"
    echo "────────────────────────────────────────────"
    echo ""
    
    # 前端在前台运行，这样可以看到日志
    npx vite &
    FRONTEND_PID=$!
fi

# 捕获退出信号，清理进程
cleanup() {
    echo ""
    echo "🛑 正在停止服务..."
    
    if [ -n "$YOLO_PID" ]; then
        kill $YOLO_PID 2>/dev/null
    fi
    if [ -n "$TRAIN_PID" ]; then
        kill $TRAIN_PID 2>/dev/null
    fi
    if [ -n "$DATASET_PID" ]; then
        kill $DATASET_PID 2>/dev/null
    fi
    if [ -n "$AUDIO_PID" ]; then
        kill $AUDIO_PID 2>/dev/null
    fi
    if [ -n "$LLM_PID" ]; then
        kill $LLM_PID 2>/dev/null
    fi
    if [ -n "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
    fi
    
    echo "👋 已退出"
    exit 0
}

trap cleanup SIGINT SIGTERM

# 等待进程
wait
