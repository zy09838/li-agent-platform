#!/bin/bash
# 完整测试数据快速测试脚本

set -e  # 遇到错误立即退出

echo "========================================"
echo "  完整测试数据自动化测试"
echo "========================================"
echo ""

# 配置
TEST_DIR="/Users/zhuyanbin/Desktop/大模型调用测试"
IMAGE_DIR="$TEST_DIR/完整测试数据/images"
OUTPUT_DIR="$TEST_DIR/完整测试数据"
LOG_FILE="$TEST_DIR/full_test_$(date +%Y%m%d_%H%M%S).log"

cd "$TEST_DIR"

# 步骤1: 检查环境
echo "步骤1: 检查测试环境..."
echo "----------------------------------------"

if [ ! -d "$IMAGE_DIR" ]; then
    echo "❌ 错误: 图片目录不存在: $IMAGE_DIR"
    exit 1
fi

IMAGE_COUNT=$(ls "$IMAGE_DIR"/*.jpg 2>/dev/null | wc -l | tr -d ' ')
echo "✓ 找到图片: $IMAGE_COUNT 张"

ANNOTATION_COUNT=$(ls "$OUTPUT_DIR/annotations"/*.json 2>/dev/null | wc -l | tr -d ' ')
echo "✓ 找到标注: $ANNOTATION_COUNT 个"

if [ ! -f "analyze.py" ]; then
    echo "❌ 错误: analyze.py 不存在"
    exit 1
fi
echo "✓ 分析脚本存在"

if [ ! -f "calculate_precision_recall.py" ]; then
    echo "❌ 错误: calculate_precision_recall.py 不存在"
    exit 1
fi
echo "✓ 准召率脚本存在"

# 检查Python环境
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: Python3 未安装"
    exit 1
fi
echo "✓ Python3 已安装: $(python3 --version)"

echo ""
echo "步骤2: 运行批量分析..."
echo "----------------------------------------"
echo "这将需要约 10-15 分钟，请耐心等待..."
echo "日志文件: $LOG_FILE"
echo ""

# 运行批量分析
python3 analyze.py \
    --batch "$IMAGE_DIR" \
    --output "$OUTPUT_DIR" \
    --log "$LOG_FILE"

echo ""
echo "✓ 批量分析完成！"

echo ""
echo "步骤3: 计算准召率..."
echo "----------------------------------------"

# 运行准召率计算
python3 calculate_precision_recall.py

echo ""
echo "✓ 准召率计算完成！"

echo ""
echo "步骤4: 查看结果摘要..."
echo "----------------------------------------"

# 找到最新的结果目录
LATEST_RESULT=$(ls -td "$OUTPUT_DIR"/分析结果_* 2>/dev/null | head -1)

if [ -n "$LATEST_RESULT" ]; then
    echo "结果目录: $LATEST_RESULT"
    echo ""

    # 显示准召率报告摘要
    if [ -f "$LATEST_RESULT/precision_recall_report.md" ]; then
        echo "========================================"
        echo "  准召率结果摘要"
        echo "========================================"
        head -30 "$LATEST_RESULT/precision_recall_report.md"
        echo ""
        echo "完整报告: $LATEST_RESULT/precision_recall_report.md"
    fi
else
    echo "⚠️  未找到结果目录"
fi

echo ""
echo "========================================"
echo "  测试完成！"
echo "========================================"
echo ""
echo "生成的文件："
echo "  - 分析结果: $LATEST_RESULT"
echo "  - 测试日志: $LOG_FILE"
echo ""
