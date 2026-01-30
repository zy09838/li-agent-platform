#!/bin/bash
# 快速批量分析脚本
# 用于快速触发对测试数据文件夹的批量分析

echo "======================================================================"
echo "AI视觉质检 - 快速批量分析"
echo "======================================================================"
echo ""

# 默认测试数据目录
TEST_DIR="测试数据"

# 检查测试目录是否存在
if [ ! -d "$TEST_DIR" ]; then
    echo "❌ 错误: 测试数据目录不存在: $TEST_DIR"
    echo ""
    echo "请确保在正确的目录下运行此脚本，或修改 TEST_DIR 变量"
    exit 1
fi

# 统计图片数量
IMAGE_COUNT=$(find "$TEST_DIR" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.gif" -o -iname "*.webp" \) | wc -l | tr -d ' ')

echo "📂 测试目录: $TEST_DIR"
echo "📊 图片数量: $IMAGE_COUNT 张"
echo ""

if [ "$IMAGE_COUNT" -eq 0 ]; then
    echo "⚠️  未找到支持的图片文件"
    exit 1
fi

# 询问是否继续
read -p "是否开始批量分析? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
fi

echo ""
echo "开始批量分析..."
echo "======================================================================"
echo ""

# 运行分析
python3 analyze.py --batch "$TEST_DIR" --log "batch_analysis.log"

echo ""
echo "======================================================================"
echo "✅ 批量分析完成!"
echo ""
echo "生成的文件:"
echo "  - 批量分析报告_*.md (Markdown格式报告)"
echo "  - 批量分析数据_*.json (JSON格式原始数据)"
echo "  - batch_analysis.log (详细执行日志)"
echo "======================================================================"
