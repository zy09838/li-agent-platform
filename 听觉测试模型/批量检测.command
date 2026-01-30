#!/bin/bash
# 批量检测 - 文件夹
# 双击此文件，然后拖拽文件夹进行批量检测

cd "$(dirname "$0")"

clear
echo "╔════════════════════════════════════════════════════════╗"
echo "║          批量音频异常检测                               ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "请将包含音频文件的文件夹拖拽到此窗口，然后按回车:"
read -e folder_path

# 去除引号
folder_path=$(echo "$folder_path" | tr -d "'\"")

if [ -d "$folder_path" ]; then
    echo ""
    echo "正在检测文件夹: $(basename "$folder_path")"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # 生成输出文件名
    timestamp=$(date +"%Y%m%d_%H%M%S")
    output_file="检测结果_${timestamp}.csv"

    # 运行检测
    python3 "$(dirname "$0")/industrial_auscultation.py" detect "$folder_path" -o "$output_file"

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✓ 结果已保存到: $output_file"
else
    echo ""
    echo "❌ 错误: 文件夹不存在"
fi

echo ""
read -p "按回车键退出..."
