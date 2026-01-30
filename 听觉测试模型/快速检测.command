#!/bin/bash
# 快速检测 - 单文件
# 双击此文件，然后拖拽音频文件进行检测

cd "$(dirname "$0")"

clear
echo "╔════════════════════════════════════════════════════════╗"
echo "║          快速音频异常检测                               ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "请将音频文件拖拽到此窗口，然后按回车:"
read -e audio_file

# 去除引号
audio_file=$(echo "$audio_file" | tr -d "'\"")

if [ -f "$audio_file" ]; then
    echo ""
    echo "正在检测: $(basename "$audio_file")"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    python3 detect_single.py "$audio_file"

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
    echo ""
    echo "❌ 错误: 文件不存在"
fi

echo ""
read -p "按回车键退出..."
