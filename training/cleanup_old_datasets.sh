#!/bin/bash

echo "======================================"
echo "🧹 训练数据集清理工具"
echo "======================================"
echo ""

cd /home/dell/桌面/智能体协作平台_0101/training

echo "📊 当前磁盘使用情况:"
df -h / | grep -E "文件系统|/dev"
echo ""

echo "📁 训练目录占用空间:"
du -sh .
echo ""

echo "🔍 发现以下训练数据集副本:"
echo ""

total_size=0
count=0

for dir in datasets_train_*; do
    if [ -d "$dir" ]; then
        size=$(du -sh "$dir" | cut -f1)
        echo "  [$((++count))] $dir - $size"
    fi
done

if [ $count -eq 0 ]; then
    echo "  没有找到训练数据集副本"
    echo ""
    echo "✅ 无需清理"
    exit 0
fi

echo ""
echo "⚠️  这些是训练过程中创建的临时副本，可以安全删除"
echo "⚠️  原始数据集 (datasets, dataset_raw) 不会被删除"
echo ""

read -p "是否删除这些副本? (y/N): " confirm

if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo ""
    echo "❌ 已取消清理"
    exit 0
fi

echo ""
echo "🗑️  正在删除..."
echo ""

deleted_count=0
for dir in datasets_train_*; do
    if [ -d "$dir" ]; then
        echo "  删除: $dir"
        rm -rf "$dir"
        ((deleted_count++))
    fi
done

echo ""
echo "✅ 清理完成！已删除 $deleted_count 个目录"
echo ""

echo "📊 清理后磁盘使用情况:"
df -h / | grep -E "文件系统|/dev"
echo ""

echo "📁 训练目录当前占用:"
du -sh .
echo ""

echo "======================================"
echo "✨ 清理完成！"
echo "======================================"
