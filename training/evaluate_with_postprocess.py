#!/usr/bin/env python3
"""
预测后处理与评估脚本

功能：
1. 加载模型进行预测
2. 后处理：相同类别重叠区域取最大的检测框
3. 加载ground truth标注
4. 计算准确率、召回率、F1等指标

使用方法：
    python3 evaluate_with_postprocess.py --model runs/train_100epochs/weights/best.pt --data_dir dataset_raw
"""

import argparse
import json
import cv2
import numpy as np
from pathlib import Path
from collections import defaultdict
from ultralytics import YOLO
from typing import List, Tuple, Dict


def parse_args():
    parser = argparse.ArgumentParser(description='预测后处理与评估')
    parser.add_argument('--model', type=str, required=True,
                        help='模型路径')
    parser.add_argument('--data_dir', type=str, default='dataset_raw',
                        help='数据目录路径')
    parser.add_argument('--conf', type=float, default=0.25,
                        help='预测置信度阈值')
    parser.add_argument('--iou_threshold', type=float, default=0.5,
                        help='IoU阈值用于评估')
    parser.add_argument('--output_dir', type=str, default='evaluation_results',
                        help='输出目录')
    return parser.parse_args()


def calculate_iou(box1: Tuple[float, float, float, float], 
                  box2: Tuple[float, float, float, float]) -> float:
    """计算两个框的IoU"""
    x1_min, y1_min, x1_max, y1_max = box1
    x2_min, y2_min, x2_max, y2_max = box2
    
    # 计算交集
    inter_x_min = max(x1_min, x2_min)
    inter_y_min = max(y1_min, y2_min)
    inter_x_max = min(x1_max, x2_max)
    inter_y_max = min(y1_max, y2_max)
    
    if inter_x_max <= inter_x_min or inter_y_max <= inter_y_min:
        return 0.0
    
    inter_area = (inter_x_max - inter_x_min) * (inter_y_max - inter_y_min)
    
    # 计算并集
    box1_area = (x1_max - x1_min) * (y1_max - y1_min)
    box2_area = (x2_max - x2_min) * (y2_max - y2_min)
    union_area = box1_area + box2_area - inter_area
    
    if union_area == 0:
        return 0.0
    
    return inter_area / union_area


def calculate_area(box: Tuple[float, float, float, float]) -> float:
    """计算框的面积"""
    x_min, y_min, x_max, y_max = box
    return (x_max - x_min) * (y_max - y_min)


def postprocess_detections(detections: List[Dict], 
                          iou_threshold: float = 0.5) -> List[Dict]:
    """
    后处理：相同类别重叠区域取最大的检测框
    
    Args:
        detections: 检测结果列表，每个元素包含 {'class': int, 'box': tuple, 'conf': float}
        iou_threshold: IoU阈值，超过此值认为是重叠
    
    Returns:
        处理后的检测结果列表
    """
    if not detections:
        return []
    
    # 按类别分组
    detections_by_class = defaultdict(list)
    for det in detections:
        detections_by_class[det['class']].append(det)
    
    filtered_detections = []
    
    # 对每个类别单独处理
    for cls_id, cls_detections in detections_by_class.items():
        if len(cls_detections) == 1:
            filtered_detections.append(cls_detections[0])
            continue
        
        # 按置信度排序
        cls_detections.sort(key=lambda x: x['conf'], reverse=True)
        
        # 计算每个框的面积
        for det in cls_detections:
            det['area'] = calculate_area(det['box'])
        
        # 按面积排序（最大的在前）
        cls_detections.sort(key=lambda x: x['area'], reverse=True)
        
        # 保留非重叠的大框
        kept = []
        for det in cls_detections:
            is_overlap = False
            for kept_det in kept:
                iou = calculate_iou(det['box'], kept_det['box'])
                if iou > iou_threshold:
                    is_overlap = True
                    break
            
            if not is_overlap:
                kept.append(det)
        
        filtered_detections.extend(kept)
    
    return filtered_detections


def load_ground_truth_json(ann_file: Path, img_width: int, img_height: int, 
                          class_names: Dict[int, str] = None) -> List[Dict]:
    """从JSON文件加载ground truth"""
    with open(ann_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    gt_boxes = []
    for ann in data.get('annotations', []):
        if ann.get('type') == 'bbox':
            points = ann['points']
            label = ann.get('label', '')
            
            if len(points) == 4:
                x, y, w, h = points
                # 转换为绝对坐标
                x_min = max(0, x)
                y_min = max(0, y)
                x_max = min(img_width, x + w)
                y_max = min(img_height, y + h)
                
                gt_boxes.append({
                    'class': label,
                    'box': (x_min, y_min, x_max, y_max)
                })
    
    return gt_boxes


def load_ground_truth_yolo(label_file: Path, img_width: int, img_height: int, 
                          class_names: Dict[int, str]) -> List[Dict]:
    """从YOLO格式标签文件加载ground truth"""
    if not label_file.exists():
        return []
    
    gt_boxes = []
    with open(label_file, 'r') as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) == 5:
                cls_id = int(parts[0])
                x_center = float(parts[1])
                y_center = float(parts[2])
                w_norm = float(parts[3])
                h_norm = float(parts[4])
                
                # 转换为绝对坐标
                x_min = (x_center - w_norm / 2) * img_width
                y_min = (y_center - h_norm / 2) * img_height
                x_max = (x_center + w_norm / 2) * img_width
                y_max = (y_center + h_norm / 2) * img_height
                
                class_name = class_names.get(cls_id, f'class_{cls_id}')
                gt_boxes.append({
                    'class': class_name,
                    'box': (x_min, y_min, x_max, y_max)
                })
    
    return gt_boxes


def convert_predictions_to_dict(results, class_names: Dict[int, str]) -> List[Dict]:
    """将YOLO预测结果转换为字典格式"""
    detections = []
    for r in results:
        boxes = r.boxes
        for box in boxes:
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            xyxy = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
            
            detections.append({
                'class': class_names[cls_id],
                'class_id': cls_id,
                'box': tuple(xyxy),
                'conf': conf
            })
    
    return detections


def evaluate_detections(pred_boxes: List[Dict], gt_boxes: List[Dict], 
                       iou_threshold: float = 0.5) -> Dict:
    """
    评估检测结果
    
    Returns:
        {
            'tp': int,  # True Positives
            'fp': int,  # False Positives
            'fn': int,  # False Negatives
            'precision': float,
            'recall': float,
            'f1': float,
            'per_class': dict  # 每个类别的指标
        }
    """
    # 按类别分组
    pred_by_class = defaultdict(list)
    gt_by_class = defaultdict(list)
    
    for pred in pred_boxes:
        pred_by_class[pred['class']].append(pred)
    
    for gt in gt_boxes:
        gt_by_class[gt['class']].append(gt)
    
    all_classes = set(pred_by_class.keys()) | set(gt_by_class.keys())
    
    total_tp = 0
    total_fp = 0
    total_fn = 0
    per_class_metrics = {}
    
    for cls in all_classes:
        preds = pred_by_class[cls]
        gts = gt_by_class[cls]
        
        # 匹配预测和ground truth
        matched_gt = set()
        tp = 0
        fp = 0
        
        for pred in preds:
            best_iou = 0
            best_gt_idx = -1
            
            for i, gt in enumerate(gts):
                if i in matched_gt:
                    continue
                
                iou = calculate_iou(pred['box'], gt['box'])
                if iou > best_iou:
                    best_iou = iou
                    best_gt_idx = i
            
            if best_iou >= iou_threshold:
                tp += 1
                matched_gt.add(best_gt_idx)
            else:
                fp += 1
        
        fn = len(gts) - len(matched_gt)
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
        
        per_class_metrics[cls] = {
            'tp': tp,
            'fp': fp,
            'fn': fn,
            'precision': precision,
            'recall': recall,
            'f1': f1
        }
        
        total_tp += tp
        total_fp += fp
        total_fn += fn
    
    overall_precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0.0
    overall_recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0.0
    overall_f1 = 2 * overall_precision * overall_recall / (overall_precision + overall_recall) \
                 if (overall_precision + overall_recall) > 0 else 0.0
    
    return {
        'tp': total_tp,
        'fp': total_fp,
        'fn': total_fn,
        'precision': overall_precision,
        'recall': overall_recall,
        'f1': overall_f1,
        'per_class': per_class_metrics
    }


def main():
    args = parse_args()
    
    print("=" * 60)
    print("预测后处理与评估")
    print("=" * 60)
    
    # 路径设置
    base_dir = Path(__file__).parent.absolute()
    data_dir = base_dir / args.data_dir
    image_dir = data_dir / 'images'
    annotation_dir = data_dir / 'annotations'
    output_dir = base_dir / args.output_dir
    output_dir.mkdir(exist_ok=True)
    
    # 加载模型
    print(f"\n加载模型: {args.model}")
    model = YOLO(args.model)
    class_names = model.names  # {0: 'class1', 1: 'class2', ...}
    class_names_reverse = {v: k for k, v in class_names.items()}  # {'class1': 0, ...}
    
    # 收集所有图片
    image_files = []
    for ext in ['.jpg', '.jpeg', '.bmp', '.png']:
        image_files.extend(list(image_dir.glob(f'*{ext}')))
    
    print(f"找到 {len(image_files)} 张图片")
    
    # 收集所有标注文件
    ann_files = list(annotation_dir.glob('*.json'))
    ann_dict = {}
    for ann_file in ann_files:
        with open(ann_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            img_name = data.get('imageName', '')
            if img_name:
                ann_dict[img_name] = ann_file
    
    print(f"找到 {len(ann_dict)} 个标注文件")
    
    # 建立类别名称映射（从JSON标注到模型类别）
    # 模型返回的是class_id，需要转换为类别名称字符串
    # 这里假设模型训练时使用的类别名称与JSON中的一致
    
    # 预测和后处理
    all_pred_processed = []
    all_gt = []
    image_results = []
    
    print("\n开始预测和后处理...")
    for img_path in sorted(image_files):
        img_name = img_path.name
        
        # 读取图片获取尺寸
        img = cv2.imread(str(img_path))
        if img is None:
            continue
        img_height, img_width = img.shape[:2]
        
        # 预测
        results = model.predict(str(img_path), conf=args.conf, verbose=False)
        
        # 转换为字典格式
        pred_detections = convert_predictions_to_dict(results, class_names)
        
        # 后处理：相同类别重叠区域取最大的
        pred_processed = postprocess_detections(pred_detections, iou_threshold=0.5)
        
        # 加载ground truth
        gt_detections = []
        if img_name in ann_dict:
            gt_detections = load_ground_truth_json(ann_dict[img_name], img_width, img_height, class_names)
        else:
            # 尝试从数据集目录加载YOLO格式标签
            for dataset_dir in base_dir.glob('datasets_*'):
                label_file = dataset_dir / 'labels' / 'train' / (Path(img_name).stem + '.txt')
                if not label_file.exists():
                    label_file = dataset_dir / 'labels' / 'val' / (Path(img_name).stem + '.txt')
                if label_file.exists():
                    gt_detections = load_ground_truth_yolo(label_file, img_width, img_height, class_names)
                    break
        
        # 保存结果
        all_pred_processed.extend(pred_processed)
        all_gt.extend(gt_detections)
        
        image_results.append({
            'image': img_name,
            'pred_count': len(pred_processed),
            'gt_count': len(gt_detections),
            'pred': pred_processed,
            'gt': gt_detections
        })
    
    # 评估
    print("\n计算评估指标...")
    metrics = evaluate_detections(all_pred_processed, all_gt, args.iou_threshold)
    
    # 打印结果
    print("\n" + "=" * 60)
    print("整体评估结果")
    print("=" * 60)
    print(f"True Positives (TP): {metrics['tp']}")
    print(f"False Positives (FP): {metrics['fp']}")
    print(f"False Negatives (FN): {metrics['fn']}")
    print(f"\n准确率 (Precision): {metrics['precision']:.4f}")
    print(f"召回率 (Recall): {metrics['recall']:.4f}")
    print(f"F1分数: {metrics['f1']:.4f}")
    
    print("\n" + "=" * 60)
    print("各类别评估结果")
    print("=" * 60)
    print(f"{'类别':<15} {'TP':<6} {'FP':<6} {'FN':<6} {'Precision':<10} {'Recall':<10} {'F1':<10}")
    print("-" * 70)
    
    for cls in sorted(metrics['per_class'].keys()):
        m = metrics['per_class'][cls]
        print(f"{cls:<15} {m['tp']:<6} {m['fp']:<6} {m['fn']:<6} "
              f"{m['precision']:<10.4f} {m['recall']:<10.4f} {m['f1']:<10.4f}")
    
    # 保存详细结果
    results_file = output_dir / 'evaluation_results.json'
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump({
            'overall': metrics,
            'image_results': [
                {
                    'image': r['image'],
                    'pred_count': r['pred_count'],
                    'gt_count': r['gt_count']
                }
                for r in image_results
            ]
        }, f, ensure_ascii=False, indent=2)
    
    print(f"\n详细结果已保存至: {results_file}")
    
    # 保存后处理后的预测结果（可视化）
    print("\n保存后处理后的预测结果...")
    vis_dir = output_dir / 'visualizations'
    vis_dir.mkdir(exist_ok=True)
    
    for img_path in sorted(image_files):
        img_name = img_path.name
        img = cv2.imread(str(img_path))
        
        # 找到对应的预测结果
        for result in image_results:
            if result['image'] == img_name:
                # 绘制预测框
                for pred in result['pred']:
                    x1, y1, x2, y2 = [int(v) for v in pred['box']]
                    cls_name = pred['class']
                    conf = pred['conf']
                    
                    # 绘制框
                    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    # 绘制标签
                    label = f"{cls_name} {conf:.2f}"
                    cv2.putText(img, label, (x1, y1 - 10), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                
                # 绘制ground truth框
                for gt in result['gt']:
                    x1, y1, x2, y2 = [int(v) for v in gt['box']]
                    cls_name = gt['class']
                    
                    # 绘制框（红色）
                    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 0, 255), 2)
                    # 绘制标签
                    cv2.putText(img, f"GT: {cls_name}", (x1, y1 - 30), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
                
                break
        
        cv2.imwrite(str(vis_dir / img_name), img)
    
    print(f"可视化结果已保存至: {vis_dir}")


if __name__ == '__main__':
    main()

