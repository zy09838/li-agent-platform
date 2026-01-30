#!/bin/bash
# 工业听诊异响检测系统 - 主菜单
# 双击此文件即可运行

# 切换到脚本所在目录
cd "$(dirname "$0")"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 清屏
clear

# 显示欢迎界面
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                        ║${NC}"
echo -e "${BLUE}║        工业听诊异响检测系统 v2.0                        ║${NC}"
echo -e "${BLUE}║        Industrial Audio Anomaly Detection              ║${NC}"
echo -e "${BLUE}║                                                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# 检查模型文件
if [ ! -f "optimized_anomaly_model.pkl" ]; then
    echo -e "${RED}错误: 找不到模型文件 optimized_anomaly_model.pkl${NC}"
    echo -e "${YELLOW}请先运行 python3 optimized_anomaly_model.py 训练模型${NC}"
    echo ""
    read -p "按回车键退出..."
    exit 1
fi

# 主循环
while true; do
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}请选择功能:${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  1. 🎵 检测单个音频文件"
    echo "  2. 📁 批量检测文件夹"
    echo "  3. 📊 查看模型信息"
    echo "  4. 📖 查看使用帮助"
    echo "  5. 🔄 重新训练模型"
    echo "  0. ❌ 退出系统"
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo -n "请输入选项 [0-5]: "
    read choice

    case $choice in
        1)
            echo ""
            echo -e "${BLUE}═══ 单个文件检测 ═══${NC}"
            echo ""
            echo "请输入音频文件路径 (或拖拽文件到此窗口):"
            read -e audio_file

            # 去除路径中的引号
            audio_file=$(echo "$audio_file" | tr -d "'\"")

            if [ -f "$audio_file" ]; then
                echo ""
                echo -e "${YELLOW}正在检测...${NC}"
                echo ""
                python3 detect_single.py "$audio_file"
                exit_code=$?
                echo ""
                if [ $exit_code -eq 0 ]; then
                    echo -e "${GREEN}✓ 检测完成 - 设备正常${NC}"
                else
                    echo -e "${RED}⚠ 检测完成 - 发现异常${NC}"
                fi
            else
                echo -e "${RED}错误: 文件不存在 - $audio_file${NC}"
            fi
            echo ""
            read -p "按回车键继续..."
            clear
            ;;

        2)
            echo ""
            echo -e "${BLUE}═══ 批量检测 ═══${NC}"
            echo ""
            echo "请输入文件夹路径 (或拖拽文件夹到此窗口):"
            read -e folder_path

            # 去除路径中的引号
            folder_path=$(echo "$folder_path" | tr -d "'\"")

            if [ -d "$folder_path" ]; then
                echo ""
                echo "请输入输出文件名 (直接回车使用默认名称):"
                read output_file

                echo ""
                echo -e "${YELLOW}正在批量检测...${NC}"
                echo ""

                if [ -z "$output_file" ]; then
                    python3 detect_batch.py "$folder_path"
                else
                    python3 detect_batch.py "$folder_path" -o "$output_file"
                fi

                exit_code=$?
                echo ""
                if [ $exit_code -eq 0 ]; then
                    echo -e "${GREEN}✓ 批量检测完成 - 全部正常${NC}"
                else
                    echo -e "${RED}⚠ 批量检测完成 - 发现异常${NC}"
                fi
            else
                echo -e "${RED}错误: 文件夹不存在 - $folder_path${NC}"
            fi
            echo ""
            read -p "按回车键继续..."
            clear
            ;;

        3)
            echo ""
            echo -e "${BLUE}═══ 模型信息 ═══${NC}"
            echo ""
            python3 -c "
import joblib
try:
    from optimized_anomaly_model import EnsembleAnomalyDetector
except:
    pass

model_data = joblib.load('optimized_anomaly_model.pkl')
print('模型类型: 集成异常检测器')
print(f'特征数量: {len(model_data[\"selected_features\"])}')
print(f'模型数量: {len(model_data[\"ensemble\"].models)}')
print('')
print('使用的特征:')
for i, feat in enumerate(model_data['selected_features'], 1):
    print(f'  {i:2d}. {feat}')
print('')
print('集成模型:')
for name in model_data['ensemble'].models.keys():
    print(f'  - {name}')
"
            echo ""
            read -p "按回车键继续..."
            clear
            ;;

        4)
            echo ""
            echo -e "${BLUE}═══ 使用帮助 ═══${NC}"
            echo ""
            if [ -f "快速开始.md" ]; then
                cat 快速开始.md | head -50
                echo ""
                echo -e "${YELLOW}更多详情请查看 '快速开始.md' 和 '脚本使用说明.md'${NC}"
            else
                echo "帮助文档:"
                echo "  1. 单文件检测: 选择选项1，输入或拖拽音频文件"
                echo "  2. 批量检测: 选择选项2，输入或拖拽文件夹"
                echo "  3. 支持的格式: .wav"
                echo ""
                echo "异常等级说明:"
                echo "  CRITICAL    - 严重异常，立即停机检查"
                echo "  HIGH        - 明显异常，尽快安排检修"
                echo "  MEDIUM      - 中度异常，近期内检查"
                echo "  SUSPICIOUS  - 可疑，持续监控"
                echo "  NORMAL      - 基本正常"
                echo "  PERFECT     - 完全正常"
            fi
            echo ""
            read -p "按回车键继续..."
            clear
            ;;

        5)
            echo ""
            echo -e "${BLUE}═══ 重新训练模型 ═══${NC}"
            echo ""
            echo -e "${YELLOW}警告: 这将覆盖现有模型！${NC}"
            echo -n "确认要重新训练吗? (y/N): "
            read confirm

            if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
                echo ""
                echo -e "${YELLOW}正在训练模型...${NC}"
                echo ""
                python3 optimized_anomaly_model.py
                echo ""
                echo -e "${GREEN}✓ 模型训练完成${NC}"
            else
                echo "已取消"
            fi
            echo ""
            read -p "按回车键继续..."
            clear
            ;;

        0)
            echo ""
            echo -e "${GREEN}感谢使用工业听诊异响检测系统！${NC}"
            echo ""
            exit 0
            ;;

        *)
            echo ""
            echo -e "${RED}无效选项，请输入 0-5${NC}"
            echo ""
            sleep 2
            clear
            ;;
    esac
done
