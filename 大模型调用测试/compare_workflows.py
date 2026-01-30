#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
工作流对比测试脚本
对比优化前后的检测效果
"""

import json
from pathlib import Path
from datetime import datetime

def load_results(result_file):
    """加载分析结果"""
    with open(result_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data

def compare_metrics(old_file, new_file):
    """对比两个准召率结果"""

    print("="*80)
    print("工作流优化效果对比")
    print("="*80)
    print()

    # 读取旧结果
    old_path = Path(old_file)
    if not old_path.exists():
        print(f"错误: 旧结果文件不存在: {old_file}")
        return

    with open(old_path, 'r', encoding='utf-8') as f:
        old_data = json.load(f)

    # 读取新结果
    new_path = Path(new_file)
    if not new_path.exists():
        print(f"错误: 新结果文件不存在: {new_file}")
        return

    with open(new_path, 'r', encoding='utf-8') as f:
        new_data = json.load(f)

    # 提取整体指标
    old_overall = old_data['overall']
    new_overall = new_data['overall']

    # 显示对比
    print("【整体指标对比】")
    print()
    print(f"{'指标':<20} {'优化前':>15} {'优化后':>15} {'提升':>15}")
    print("-"*80)

    # 准确率
    old_precision = old_overall['precision']
    new_precision = new_overall['precision']
    improvement = new_precision - old_precision
    print(f"{'准确率 (Precision)':<20} {old_precision:>14.2%} {new_precision:>14.2%} {improvement:>+14.2%}")

    # 召回率
    old_recall = old_overall['recall']
    new_recall = new_overall['recall']
    improvement = new_recall - old_recall
    print(f"{'召回率 (Recall)':<20} {old_recall:>14.2%} {new_recall:>14.2%} {improvement:>+14.2%}")

    # F1分数
    old_f1 = old_overall['f1']
    new_f1 = new_overall['f1']
    improvement = new_f1 - old_f1
    print(f"{'F1分数':<20} {old_f1:>14.2%} {new_f1:>14.2%} {improvement:>+14.2%}")

    print()
    print(f"{'样本数量':<20} {old_overall['total_samples']:>15} {new_overall['total_samples']:>15}")

    print()
    print("【统计详情】")
    print()
    print(f"{'统计项':<20} {'优化前':>15} {'优化后':>15} {'变化':>15}")
    print("-"*80)

    # TP, FP, FN
    print(f"{'True Positives':<20} {old_overall['tp']:>15} {new_overall['tp']:>15} {new_overall['tp']-old_overall['tp']:>+15}")
    print(f"{'False Positives':<20} {old_overall['fp']:>15} {new_overall['fp']:>15} {new_overall['fp']-old_overall['fp']:>+15}")
    print(f"{'False Negatives':<20} {old_overall['fn']:>15} {new_overall['fn']:>15} {new_overall['fn']-old_overall['fn']:>+15}")

    print()
    print("【分项指标对比】")
    print()

    # 按缺陷类型对比
    old_by_type = {item['defect_type']: item for item in old_data['by_defect_type']}
    new_by_type = {item['defect_type']: item for item in new_data['by_defect_type']}

    all_types = sorted(set(old_by_type.keys()) | set(new_by_type.keys()))

    print(f"{'缺陷类型':<15} {'优化前F1':>12} {'优化后F1':>12} {'提升':>12} {'说明':<20}")
    print("-"*80)

    for defect_type in all_types:
        old_item = old_by_type.get(defect_type, {})
        new_item = new_by_type.get(defect_type, {})

        old_f1 = old_item.get('f1', 0)
        new_f1 = new_item.get('f1', 0)
        improvement = new_f1 - old_f1

        # 判断改进情况
        if improvement > 0.3:
            status = "✅ 显著改善"
        elif improvement > 0.1:
            status = "🔼 有所改善"
        elif improvement > -0.1:
            status = "➡️  基本持平"
        else:
            status = "⚠️  有所下降"

        print(f"{defect_type:<15} {old_f1:>11.1%} {new_f1:>11.1%} {improvement:>+11.1%} {status:<20}")

    print()
    print("【关键改进点】")
    print()

    # 找出改进最大的缺陷类型
    improvements = []
    for defect_type in all_types:
        old_item = old_by_type.get(defect_type, {})
        new_item = new_by_type.get(defect_type, {})
        old_f1 = old_item.get('f1', 0)
        new_f1 = new_item.get('f1', 0)
        improvement = new_f1 - old_f1
        improvements.append((defect_type, old_f1, new_f1, improvement))

    improvements.sort(key=lambda x: x[3], reverse=True)

    print("✅ 改进最显著的缺陷类型（Top 3）：")
    for i, (defect_type, old_f1, new_f1, improvement) in enumerate(improvements[:3], 1):
        if improvement > 0:
            print(f"   {i}. {defect_type}: {old_f1:.1%} → {new_f1:.1%} (提升 {improvement:+.1%})")

    print()

    # 找出需要继续改进的
    print("⚠️  仍需改进的缺陷类型：")
    need_improvement = [(t, f1) for t, _, f1, _ in improvements if f1 < 0.5]
    if need_improvement:
        for defect_type, f1 in need_improvement:
            print(f"   - {defect_type}: F1={f1:.1%}")
    else:
        print("   所有缺陷类型表现良好")

    print()
    print("【误报分析】")
    print()

    # 误报减少情况
    fp_reduction = old_overall['fp'] - new_overall['fp']
    fp_reduction_rate = fp_reduction / old_overall['fp'] if old_overall['fp'] > 0 else 0

    print(f"误报数量减少: {old_overall['fp']} → {new_overall['fp']} (减少 {fp_reduction}个, {fp_reduction_rate:.1%})")

    # 找出误报最多的类型
    print()
    print("误报最多的缺陷类型（新工作流）：")
    false_positives = [(item['defect_type'], item['fp']) for item in new_data['by_defect_type'] if item['fp'] > 0]
    false_positives.sort(key=lambda x: x[1], reverse=True)

    for defect_type, fp_count in false_positives[:5]:
        print(f"   - {defect_type}: {fp_count}次误报")

    print()
    print("【漏检分析】")
    print()

    # 漏检减少情况
    fn_reduction = old_overall['fn'] - new_overall['fn']
    fn_reduction_rate = fn_reduction / old_overall['fn'] if old_overall['fn'] > 0 else 0

    print(f"漏检数量减少: {old_overall['fn']} → {new_overall['fn']} (减少 {fn_reduction}个, {fn_reduction_rate:.1%})")

    # 找出漏检最多的类型
    print()
    print("漏检最多的缺陷类型（新工作流）：")
    false_negatives = [(item['defect_type'], item['fn']) for item in new_data['by_defect_type'] if item['fn'] > 0]
    false_negatives.sort(key=lambda x: x[1], reverse=True)

    for defect_type, fn_count in false_negatives[:5]:
        print(f"   - {defect_type}: {fn_count}次漏检")

    print()
    print("="*80)
    print("对比完成")
    print("="*80)
    print()

    # 保存对比报告
    report_file = "工作流对比报告_" + datetime.now().strftime('%Y%m%d_%H%M%S') + ".txt"
    print(f"对比报告已保存: {report_file}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description='工作流优化效果对比')
    parser.add_argument('--old', default='分析结果_20251230_141114/precision_recall_results.json',
                       help='优化前的结果文件')
    parser.add_argument('--new', default=None,
                       help='优化后的结果文件（不指定则自动查找最新）')

    args = parser.parse_args()

    base_dir = Path("/Users/zhuyanbin/Desktop/大模型调用测试")

    # 旧结果文件
    old_file = base_dir / args.old

    # 新结果文件（自动查找最新）
    if args.new:
        new_file = base_dir / args.new
    else:
        # 查找最新的结果文件
        result_dirs = list((base_dir / "完整测试数据").glob("分析结果_*"))
        if not result_dirs:
            print("错误: 未找到新的分析结果")
            return

        latest_dir = sorted(result_dirs, key=lambda x: x.name, reverse=True)[0]
        new_file = latest_dir / "precision_recall_results.json"

    # 对比
    compare_metrics(str(old_file), str(new_file))


if __name__ == "__main__":
    main()
