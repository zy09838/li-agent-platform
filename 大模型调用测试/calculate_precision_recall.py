#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大模型缺陷检测准召率计算脚本
匹配完整测试数据的原始标注和大模型调用结果，计算准确率和召回率
"""

import json
import os
import re
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple, Set

# 缺陷类型映射表（将不同的表述映射到标准类型）
DEFECT_TYPE_MAPPING = {
    # 划伤类
    '划伤': '划伤',
    '划痕': '划伤',
    '擦痕': '划伤',
    '微细划伤': '划伤',
    '微划伤': '划伤',
    'scratch': '划伤',
    'micro-scratch': '划伤',
    'abrasion': '划伤',

    # 颗粒类
    '颗粒': '颗粒',
    '异色颗粒': '颗粒',
    '杂质': '颗粒',
    'particle': '颗粒',
    'foreign particle': '颗粒',
    'inclusion': '颗粒',
    'dust': '颗粒',

    # 橘皮类
    '橘皮': '橘皮',
    'orange peel': '橘皮',

    # 抛光印类
    '抛光印': '抛光印',
    'polishing mark': '抛光印',

    # 缩孔类
    '缩孔': '缩孔',
    '针孔': '缩孔',
    'crater': '缩孔',
    'pinhole': '缩孔',
    'shrinkage hole': '缩孔',

    # 凹陷类
    '凹陷': '凹陷',
    'dent': '凹陷',
    'sink mark': '凹陷',

    # 其他
    '流挂': '流挂',
    'sag': '流挂',
    'run': '流挂',
}


def normalize_defect_type(defect_name: str) -> str:
    """标准化缺陷类型名称"""
    defect_name_lower = defect_name.lower().strip()

    # 先尝试完整匹配
    if defect_name_lower in DEFECT_TYPE_MAPPING:
        return DEFECT_TYPE_MAPPING[defect_name_lower]

    # 尝试部分匹配
    for key, value in DEFECT_TYPE_MAPPING.items():
        if key in defect_name_lower or defect_name_lower in key:
            return value

    # 如果没有匹配，返回原始名称
    return defect_name


def extract_defects_from_llm_response(analysis_text: str) -> Set[str]:
    """从大模型的分析结果中提取检测到的缺陷类型"""
    defects = set()

    if not analysis_text:
        return defects

    # 查找JSON格式的检测结果
    json_pattern = r'\{[\s\S]*?"detected_defects"[\s\S]*?\}'
    json_matches = re.findall(json_pattern, analysis_text)

    for json_str in json_matches:
        try:
            # 尝试提取完整的JSON对象
            start_idx = json_str.find('{')
            brace_count = 0
            for i, char in enumerate(json_str[start_idx:], start=start_idx):
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        json_str = json_str[start_idx:i+1]
                        break

            result = json.loads(json_str)

            # 提取detected_defects
            if 'inspection_result' in result and 'detected_defects' in result['inspection_result']:
                detected = result['inspection_result']['detected_defects']
            elif 'detected_defects' in result:
                detected = result['detected_defects']
            else:
                continue

            for defect in detected:
                if 'type' in defect:
                    # 提取缺陷类型的主要部分（去掉括号内的英文注释）
                    defect_type = defect['type']
                    # 去掉括号及其内容
                    defect_type = re.sub(r'\s*\([^)]*\)', '', defect_type)
                    # 去掉斜杠后的内容
                    defect_type = defect_type.split('/')[0].strip()

                    # 只统计明确标记为问题的缺陷（排除状态评估、正常范围等）
                    verdict = defect.get('verdict', '').upper()
                    if verdict in ['NG', 'REVIEW']:
                        normalized = normalize_defect_type(defect_type)
                        defects.add(normalized)
        except json.JSONDecodeError:
            continue

    # 如果JSON解析失败，尝试文本模式匹配
    if not defects:
        for pattern, standard_type in DEFECT_TYPE_MAPPING.items():
            if pattern in analysis_text.lower():
                # 检查是否有NG或REVIEW判定
                if 'ng' in analysis_text.lower() or 'review' in analysis_text.lower():
                    defects.add(standard_type)

    return defects


def load_annotations(annotations_dir: str) -> Dict[str, Set[str]]:
    """加载原始标注数据"""
    annotations = {}

    annotations_path = Path(annotations_dir)
    if not annotations_path.exists():
        print(f"警告: 标注目录不存在: {annotations_dir}")
        return annotations

    for json_file in annotations_path.glob("*.json"):
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            image_name = data.get('imageName', '')
            if not image_name:
                continue

            # 提取缺陷类型
            defects = set()
            for annotation in data.get('annotations', []):
                label = annotation.get('label', '')
                if label:
                    normalized = normalize_defect_type(label)
                    defects.add(normalized)

            annotations[image_name] = defects
        except Exception as e:
            print(f"警告: 读取标注文件失败 {json_file}: {e}")

    return annotations


def load_llm_results(results_json_path: str) -> Dict[str, Set[str]]:
    """加载大模型检测结果"""
    llm_results = {}

    try:
        with open(results_json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        for result in data.get('results', []):
            if not result.get('success', False):
                continue

            filename = result.get('filename', '')
            analysis = result.get('analysis', '')

            if filename and analysis:
                defects = extract_defects_from_llm_response(analysis)
                llm_results[filename] = defects
    except Exception as e:
        print(f"错误: 读取大模型结果文件失败: {e}")

    return llm_results


def match_filenames(annotations: Dict[str, Set[str]], llm_results: Dict[str, Set[str]]) -> List[Tuple[str, str]]:
    """匹配标注文件名和大模型结果文件名"""
    matches = []

    # 创建文件名映射（去掉扩展名和前缀编号）
    def normalize_filename(filename: str) -> str:
        # 去掉扩展名
        name = os.path.splitext(filename)[0]
        # 去掉前缀编号（如 001-、009-）
        name = re.sub(r'^\d+-', '', name)
        return name

    annotation_map = {normalize_filename(k): k for k in annotations.keys()}
    llm_map = {normalize_filename(k): k for k in llm_results.keys()}

    # 匹配文件
    for norm_name in annotation_map.keys():
        if norm_name in llm_map:
            matches.append((annotation_map[norm_name], llm_map[norm_name]))

    return matches


def calculate_metrics(ground_truth: Set[str], predictions: Set[str]) -> Dict[str, float]:
    """计算单个样本的准确率和召回率"""
    if not ground_truth and not predictions:
        return {'precision': 1.0, 'recall': 1.0, 'f1': 1.0, 'tp': 0, 'fp': 0, 'fn': 0}

    if not ground_truth:
        return {'precision': 0.0, 'recall': 1.0, 'f1': 0.0, 'tp': 0, 'fp': len(predictions), 'fn': 0}

    if not predictions:
        return {'precision': 1.0, 'recall': 0.0, 'f1': 0.0, 'tp': 0, 'fp': 0, 'fn': len(ground_truth)}

    tp = len(ground_truth & predictions)  # True Positives
    fp = len(predictions - ground_truth)   # False Positives
    fn = len(ground_truth - predictions)   # False Negatives

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    return {
        'precision': precision,
        'recall': recall,
        'f1': f1,
        'tp': tp,
        'fp': fp,
        'fn': fn
    }


def calculate_overall_metrics(annotations: Dict[str, Set[str]],
                             llm_results: Dict[str, Set[str]],
                             matches: List[Tuple[str, str]]) -> Dict:
    """计算整体准召率"""
    total_tp = 0
    total_fp = 0
    total_fn = 0

    sample_metrics = []
    defect_type_metrics = defaultdict(lambda: {'tp': 0, 'fp': 0, 'fn': 0})

    for ann_file, llm_file in matches:
        gt_defects = annotations[ann_file]
        pred_defects = llm_results[llm_file]

        metrics = calculate_metrics(gt_defects, pred_defects)
        sample_metrics.append({
            'annotation_file': ann_file,
            'llm_file': llm_file,
            'ground_truth': list(gt_defects),
            'predictions': list(pred_defects),
            'metrics': metrics
        })

        total_tp += metrics['tp']
        total_fp += metrics['fp']
        total_fn += metrics['fn']

        # 按缺陷类型统计
        for defect_type in gt_defects:
            if defect_type in pred_defects:
                defect_type_metrics[defect_type]['tp'] += 1
            else:
                defect_type_metrics[defect_type]['fn'] += 1

        for defect_type in pred_defects:
            if defect_type not in gt_defects:
                defect_type_metrics[defect_type]['fp'] += 1

    # 计算整体指标
    overall_precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0.0
    overall_recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0.0
    overall_f1 = 2 * overall_precision * overall_recall / (overall_precision + overall_recall) \
        if (overall_precision + overall_recall) > 0 else 0.0

    # 计算各缺陷类型的指标
    defect_metrics_list = []
    for defect_type, counts in defect_type_metrics.items():
        tp = counts['tp']
        fp = counts['fp']
        fn = counts['fn']

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

        defect_metrics_list.append({
            'defect_type': defect_type,
            'precision': precision,
            'recall': recall,
            'f1': f1,
            'tp': tp,
            'fp': fp,
            'fn': fn,
            'support': tp + fn  # 该类型在标注中出现的总次数
        })

    # 按support排序
    defect_metrics_list.sort(key=lambda x: x['support'], reverse=True)

    return {
        'overall': {
            'precision': overall_precision,
            'recall': overall_recall,
            'f1': overall_f1,
            'tp': total_tp,
            'fp': total_fp,
            'fn': total_fn,
            'total_samples': len(matches)
        },
        'by_defect_type': defect_metrics_list,
        'sample_details': sample_metrics
    }


def print_results(results: Dict):
    """打印结果"""
    print("\n" + "="*80)
    print("大模型缺陷检测准召率分析报告")
    print("="*80)

    overall = results['overall']
    print(f"\n【整体指标】")
    print(f"样本数量: {overall['total_samples']}")
    print(f"准确率 (Precision): {overall['precision']:.2%}")
    print(f"召回率 (Recall):    {overall['recall']:.2%}")
    print(f"F1分数:            {overall['f1']:.2%}")
    print(f"\n统计:")
    print(f"  - True Positives (TP):  {overall['tp']}")
    print(f"  - False Positives (FP): {overall['fp']}")
    print(f"  - False Negatives (FN): {overall['fn']}")

    print(f"\n{'='*80}")
    print("【分项指标 - 按缺陷类型】")
    print("="*80)
    print(f"{'缺陷类型':<15} {'准确率':>10} {'召回率':>10} {'F1分数':>10} {'TP':>6} {'FP':>6} {'FN':>6} {'支持数':>8}")
    print("-"*80)

    for item in results['by_defect_type']:
        print(f"{item['defect_type']:<15} "
              f"{item['precision']:>9.1%} "
              f"{item['recall']:>9.1%} "
              f"{item['f1']:>9.1%} "
              f"{item['tp']:>6} "
              f"{item['fp']:>6} "
              f"{item['fn']:>6} "
              f"{item['support']:>8}")

    print("\n" + "="*80)
    print("【样本详情】")
    print("="*80)

    for detail in results['sample_details']:
        print(f"\n文件: {detail['llm_file']}")
        print(f"  标注缺陷: {detail['ground_truth']}")
        print(f"  检测缺陷: {detail['predictions']}")
        print(f"  准确率: {detail['metrics']['precision']:.1%}, "
              f"召回率: {detail['metrics']['recall']:.1%}, "
              f"F1: {detail['metrics']['f1']:.1%}")


def save_results(results: Dict, output_dir: str):
    """保存结果到文件"""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # 保存JSON格式
    json_file = output_path / "precision_recall_results.json"
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n结果已保存到: {json_file}")

    # 保存Markdown格式报告
    md_file = output_path / "precision_recall_report.md"
    with open(md_file, 'w', encoding='utf-8') as f:
        f.write("# 大模型缺陷检测准召率分析报告\n\n")

        overall = results['overall']
        f.write("## 整体指标\n\n")
        f.write(f"- **样本数量**: {overall['total_samples']}\n")
        f.write(f"- **准确率 (Precision)**: {overall['precision']:.2%}\n")
        f.write(f"- **召回率 (Recall)**: {overall['recall']:.2%}\n")
        f.write(f"- **F1分数**: {overall['f1']:.2%}\n\n")
        f.write("### 统计\n\n")
        f.write(f"- True Positives (TP): {overall['tp']}\n")
        f.write(f"- False Positives (FP): {overall['fp']}\n")
        f.write(f"- False Negatives (FN): {overall['fn']}\n\n")

        f.write("## 分项指标 - 按缺陷类型\n\n")
        f.write("| 缺陷类型 | 准确率 | 召回率 | F1分数 | TP | FP | FN | 支持数 |\n")
        f.write("|---------|--------|--------|--------|----|----|----|---------|\n")

        for item in results['by_defect_type']:
            f.write(f"| {item['defect_type']} | "
                   f"{item['precision']:.1%} | "
                   f"{item['recall']:.1%} | "
                   f"{item['f1']:.1%} | "
                   f"{item['tp']} | "
                   f"{item['fp']} | "
                   f"{item['fn']} | "
                   f"{item['support']} |\n")

        f.write("\n## 样本详情\n\n")
        for detail in results['sample_details']:
            f.write(f"### {detail['llm_file']}\n\n")
            f.write(f"- **标注缺陷**: {', '.join(detail['ground_truth']) if detail['ground_truth'] else '无'}\n")
            f.write(f"- **检测缺陷**: {', '.join(detail['predictions']) if detail['predictions'] else '无'}\n")
            f.write(f"- **准确率**: {detail['metrics']['precision']:.1%}\n")
            f.write(f"- **召回率**: {detail['metrics']['recall']:.1%}\n")
            f.write(f"- **F1分数**: {detail['metrics']['f1']:.1%}\n\n")

    print(f"报告已保存到: {md_file}")


def main():
    # 路径配置
    base_dir = "/Users/zhuyanbin/Desktop/大模型调用测试"
    annotations_dir = os.path.join(base_dir, "完整测试数据/annotations")

    # 查找最新的分析结果目录（在完整测试数据目录下）
    result_dirs = [d for d in Path(base_dir).glob("完整测试数据/分析结果_*") if d.is_dir()]
    if not result_dirs:
        # 如果在完整测试数据目录下没有找到，尝试在主目录下查找
        result_dirs = [d for d in Path(base_dir).glob("分析结果_*") if d.is_dir()]

    if not result_dirs:
        print("错误: 未找到分析结果目录")
        return

    latest_result_dir = sorted(result_dirs, key=lambda x: x.name, reverse=True)[0]
    llm_results_file = latest_result_dir / "原始数据.json"

    if not llm_results_file.exists():
        print(f"错误: 未找到大模型结果文件: {llm_results_file}")
        return

    print(f"加载原始标注数据: {annotations_dir}")
    annotations = load_annotations(annotations_dir)
    print(f"  - 加载了 {len(annotations)} 个标注文件")

    print(f"\n加载大模型检测结果: {llm_results_file}")
    llm_results = load_llm_results(str(llm_results_file))
    print(f"  - 加载了 {len(llm_results)} 个检测结果")

    print("\n匹配文件...")
    matches = match_filenames(annotations, llm_results)
    print(f"  - 成功匹配 {len(matches)} 个样本")

    if not matches:
        print("\n错误: 没有匹配的样本，无法计算指标")
        return

    print("\n计算准召率...")
    results = calculate_overall_metrics(annotations, llm_results, matches)

    # 打印结果
    print_results(results)

    # 保存结果
    output_dir = latest_result_dir
    save_results(results, str(output_dir))


if __name__ == "__main__":
    main()
