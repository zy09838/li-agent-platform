#!/bin/bash
# 训练模型
# 双击此文件重新训练异常检测模型

cd "$(dirname "$0")"

clear
echo "╔════════════════════════════════════════════════════════╗"
echo "║          模型训练程序                                   ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# 检查是否存在特征数据
if [ ! -f "enhanced_audio_features.csv" ] && [ ! -f "audio_features.csv" ]; then
    echo "⚠️  未找到特征数据文件"
    echo ""
    echo "需要先提取特征。是否现在提取? (y/N):"
    read extract

    if [ "$extract" = "y" ] || [ "$extract" = "Y" ]; then
        echo ""
        echo "正在提取增强特征..."
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        python3 enhanced_feature_extraction.py
        echo ""
    else
        echo ""
        echo "❌ 已取消训练"
        read -p "按回车键退出..."
        exit 1
    fi
fi

echo ""
echo "开始训练优化模型..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
# 运行训练
python3 "$(dirname "$0")/industrial_auscultation.py" train

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ 训练完成！"
echo ""
echo "生成的文件:"
echo "  - optimized_anomaly_model.pkl (模型文件)"
echo "  - optimized_model_results.csv (预测结果)"
echo "  - feature_importance.csv (特征重要性)"
echo "  - ensemble_model_enhanced_results.png (可视化结果)"
echo ""

read -p "按回车键退出..."
