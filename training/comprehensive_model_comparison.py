#!/usr/bin/env python3
"""
YOLO11 综合模型对比脚本

功能：
1. 对比不同模型大小（nano, small, medium, large）
2. 对比不同训练参数（epochs, batch size, image size）
3. 自动训练和评估
4. 生成详细的HTML和Markdown报告
5. 包含准确率、召回率、mAP等指标
6. 生成可视化对比图表

使用方法：
    # 基础对比（nano, small, medium, 100 epochs）
    python3 comprehensive_model_comparison.py --preset basic

    # 标准对比（nano, small, medium, large, 100/150 epochs）
    python3 comprehensive_model_comparison.py --preset standard

    # 完整对比（所有模型，多个参数组合）
    python3 comprehensive_model_comparison.py --preset full

    # 自定义对比
    python3 comprehensive_model_comparison.py \
        --models nano small medium \
        --epochs 100 150 \
        --batch_sizes 8 16 \
        --imgsz 640 800 \
        --augment

作者：Claude Code
版本：2.0
"""

import argparse
import subprocess
import json
import sys
import time
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Tuple
import numpy as np

# 设置中文字体
plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Arial Unicode MS', 'SimHei']
plt.rcParams['axes.unicode_minus'] = False

class ComprehensiveModelComparison:
    """综合模型对比类"""

    def __init__(self, args):
        self.args = args
        self.base_dir = Path(__file__).parent.absolute()
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.results = []
        self.report_dir = self.base_dir / f'comparison_report_{self.timestamp}'
        self.report_dir.mkdir(exist_ok=True)

        # 默认batch大小映射
        self.default_batch_map = {
            'nano': 16,
            'small': 12,
            'medium': 8,
            'large': 6,
            'x': 4
        }

    def run_single_experiment(self, config: Dict) -> Dict:
        """运行单个实验"""
        print(f"\n{'='*80}")
        print(f"实验配置:")
        for k, v in config.items():
            print(f"  {k}: {v}")
        print(f"{'='*80}\n")

        # 构建训练命令
        cmd = [
            'python3', 'train_pipeline.py',
            '--data_dir', config['data_dir'],
            '--model_size', config['model_size'],
            '--epochs', str(config['epochs']),
            '--batch', str(config['batch']),
            '--imgsz', str(config['imgsz']),
            '--name', config['run_name'],
            '--device', config['device']
        ]

        if config.get('augment', False):
            cmd.append('--augment')

        print(f"执行命令: {' '.join(cmd)}\n")

        # 运行训练
        start_time = time.time()
        result = subprocess.run(cmd, capture_output=False, text=True)
        training_time = time.time() - start_time

        if result.returncode != 0:
            print(f"✗ 训练失败")
            return None

        print(f"✓ 训练完成，耗时: {training_time/60:.2f} 分钟")

        # 等待文件写入
        time.sleep(2)

        # 查找训练结果
        runs_dir = self.base_dir / 'runs'
        run_name = config['run_name']
        train_dir = runs_dir / run_name

        if not train_dir.exists():
            # 尝试查找最新的匹配目录
            matching_dirs = [d for d in runs_dir.iterdir()
                           if d.is_dir() and run_name in d.name]
            if matching_dirs:
                train_dir = max(matching_dirs, key=lambda x: x.stat().st_mtime)

        # 提取指标
        metrics = self.extract_metrics(train_dir, config)

        if metrics:
            result_data = {
                'config': config,
                'metrics': metrics,
                'training_time': training_time,
                'run_name': train_dir.name,
                'model_path': str(train_dir / 'weights' / 'best.pt')
            }
            print(f"\n指标提取成功:")
            for k, v in metrics.items():
                if isinstance(v, (int, float)):
                    print(f"  {k}: {v:.4f}")
            return result_data
        else:
            print(f"✗ 指标提取失败")
            return None

    def extract_metrics(self, train_dir: Path, config: Dict) -> Dict:
        """从训练结果中提取指标（包含per-class指标）"""
        metrics = {}

        # 1. 从results.csv提取整体指标
        results_csv = train_dir / 'results.csv'
        if results_csv.exists():
            try:
                df = pd.read_csv(results_csv)
                df.columns = df.columns.str.strip()

                # 获取最佳epoch的指标（通常是最后几轮的最好值）
                # 取最后10轮的最大值
                last_n = min(10, len(df))
                df_last = df.tail(last_n)

                # 提取关键指标
                metric_mappings = {
                    'mAP50': ['metrics/mAP50(B)', 'metrics/mAP_0.5', 'val/mAP50'],
                    'mAP50-95': ['metrics/mAP50-95(B)', 'metrics/mAP', 'val/mAP50-95'],
                    'precision': ['metrics/precision(B)', 'precision', 'val/precision'],
                    'recall': ['metrics/recall(B)', 'recall', 'val/recall'],
                    'box_loss': ['val/box_loss', 'box_loss'],
                    'cls_loss': ['val/cls_loss', 'cls_loss'],
                    'dfl_loss': ['val/dfl_loss', 'dfl_loss']
                }

                for metric_name, possible_cols in metric_mappings.items():
                    for col in possible_cols:
                        if col in df.columns:
                            metrics[metric_name] = float(df_last[col].max())
                            break

                print(f"  ✓ 从 results.csv 提取了 {len(metrics)} 个整体指标")

            except Exception as e:
                print(f"  ✗ 读取results.csv失败: {e}")

        # 2. 运行val评估获取per-class指标
        per_class_metrics = {}
        class_names = []

        print(f"  尝试运行val评估以获取per-class指标...")
        try:
            from ultralytics import YOLO
            model_path = train_dir / 'weights' / 'best.pt'
            if model_path.exists():
                model = YOLO(str(model_path))

                # 构建data.yaml路径
                data_yaml = self.base_dir / f"data_{config['run_name']}.yaml"
                if not data_yaml.exists():
                    # 尝试查找最近的data文件
                    data_files = list(self.base_dir.glob('data_*.yaml'))
                    if data_files:
                        data_yaml = max(data_files, key=lambda x: x.stat().st_mtime)

                if data_yaml.exists():
                    val_results = model.val(
                        data=str(data_yaml),
                        split='test',
                        device=config.get('device', 'cuda'),
                        verbose=False
                    )

                    # 提取整体指标
                    metrics['mAP50'] = float(val_results.box.map50)
                    metrics['mAP50-95'] = float(val_results.box.map)
                    metrics['precision'] = float(val_results.box.mp)
                    metrics['recall'] = float(val_results.box.mr)

                    # 提取per-class指标
                    if hasattr(val_results.box, 'maps'):
                        # 获取类别名称
                        class_names = list(model.names.values())

                        # per-class AP50
                        if hasattr(val_results.box, 'ap50'):
                            per_class_metrics['ap50'] = val_results.box.ap50.tolist()

                        # per-class AP50-95
                        if hasattr(val_results.box, 'ap'):
                            per_class_metrics['ap'] = val_results.box.ap.tolist()

                        # per-class Precision
                        if hasattr(val_results.box, 'p'):
                            per_class_metrics['precision'] = val_results.box.p.tolist()

                        # per-class Recall
                        if hasattr(val_results.box, 'r'):
                            per_class_metrics['recall'] = val_results.box.r.tolist()

                        print(f"  ✓ 提取了 {len(class_names)} 个类别的per-class指标")

                    print(f"  ✓ 从val评估提取了完整指标")
                else:
                    print(f"  ✗ 未找到data.yaml文件")
        except Exception as e:
            print(f"  ✗ val评估失败: {e}")
            import traceback
            traceback.print_exc()

        # 3. 确保有默认值
        default_metrics = {
            'mAP50': 0.0,
            'mAP50-95': 0.0,
            'precision': 0.0,
            'recall': 0.0,
            'box_loss': 0.0,
            'cls_loss': 0.0,
            'dfl_loss': 0.0
        }

        for key, default_val in default_metrics.items():
            if key not in metrics:
                metrics[key] = default_val

        # 4. 添加模型信息
        metrics['model_size'] = config['model_size']
        metrics['epochs'] = config['epochs']
        metrics['batch'] = config['batch']
        metrics['imgsz'] = config['imgsz']
        metrics['augment'] = config.get('augment', False)

        # 5. 计算F1 score
        if metrics['precision'] > 0 and metrics['recall'] > 0:
            metrics['f1_score'] = 2 * (metrics['precision'] * metrics['recall']) / \
                                 (metrics['precision'] + metrics['recall'])
        else:
            metrics['f1_score'] = 0.0

        # 6. 添加per-class指标
        if per_class_metrics and class_names:
            metrics['per_class'] = per_class_metrics
            metrics['class_names'] = class_names
        else:
            metrics['per_class'] = {}
            metrics['class_names'] = []

        return metrics

    def generate_comparison_table(self) -> pd.DataFrame:
        """生成对比表格"""
        rows = []
        for result in self.results:
            config = result['config']
            metrics = result['metrics']

            row = {
                '模型': config['model_size'],
                'Epochs': config['epochs'],
                'Batch': config['batch'],
                'ImgSize': config['imgsz'],
                '数据增强': '是' if config.get('augment') else '否',
                'mAP@50': metrics.get('mAP50', 0),
                'mAP@50-95': metrics.get('mAP50-95', 0),
                'Precision': metrics.get('precision', 0),
                'Recall': metrics.get('recall', 0),
                'F1 Score': metrics.get('f1_score', 0),
                'Box Loss': metrics.get('box_loss', 0),
                '训练时间(分)': result['training_time'] / 60,
                '运行名称': result['run_name']
            }
            rows.append(row)

        df = pd.DataFrame(rows)
        return df

    def create_visualizations(self, df: pd.DataFrame):
        """创建可视化图表（包含per-class对比）"""
        print("\n生成可视化图表...")

        # 设置样式
        sns.set_style("whitegrid")
        sns.set_palette("husl")

        # 创建per-class对比图表
        self._create_per_class_charts()

        # 1. mAP对比图
        fig, axes = plt.subplots(2, 2, figsize=(16, 12))

        # 1.1 不同模型的mAP@50对比
        ax = axes[0, 0]
        model_groups = df.groupby('模型')['mAP@50'].mean().sort_values(ascending=False)
        model_groups.plot(kind='bar', ax=ax, color='steelblue')
        ax.set_title('Different Models mAP@50 Comparison', fontsize=14, fontweight='bold')
        ax.set_xlabel('Model', fontsize=12)
        ax.set_ylabel('mAP@50', fontsize=12)
        ax.set_ylim([0, 1.0])
        ax.grid(True, alpha=0.3)
        for i, v in enumerate(model_groups.values):
            ax.text(i, v + 0.02, f'{v:.3f}', ha='center', va='bottom')

        # 1.2 Precision vs Recall散点图
        ax = axes[0, 1]
        for model in df['模型'].unique():
            model_data = df[df['模型'] == model]
            ax.scatter(model_data['Recall'], model_data['Precision'],
                      label=model, s=100, alpha=0.6)
        ax.set_title('Precision vs Recall', fontsize=14, fontweight='bold')
        ax.set_xlabel('Recall', fontsize=12)
        ax.set_ylabel('Precision', fontsize=12)
        ax.set_xlim([0, 1.0])
        ax.set_ylim([0, 1.0])
        ax.legend()
        ax.grid(True, alpha=0.3)

        # 1.3 训练时间对比
        ax = axes[1, 0]
        model_time = df.groupby('模型')['训练时间(分)'].mean().sort_values()
        model_time.plot(kind='barh', ax=ax, color='coral')
        ax.set_title('Training Time Comparison', fontsize=14, fontweight='bold')
        ax.set_xlabel('Training Time (minutes)', fontsize=12)
        ax.set_ylabel('Model', fontsize=12)
        ax.grid(True, alpha=0.3)
        for i, v in enumerate(model_time.values):
            ax.text(v + 1, i, f'{v:.1f}min', va='center')

        # 1.4 F1 Score对比
        ax = axes[1, 1]
        model_f1 = df.groupby('模型')['F1 Score'].mean().sort_values(ascending=False)
        model_f1.plot(kind='bar', ax=ax, color='lightgreen')
        ax.set_title('F1 Score Comparison', fontsize=14, fontweight='bold')
        ax.set_xlabel('Model', fontsize=12)
        ax.set_ylabel('F1 Score', fontsize=12)
        ax.set_ylim([0, 1.0])
        ax.grid(True, alpha=0.3)
        for i, v in enumerate(model_f1.values):
            ax.text(i, v + 0.02, f'{v:.3f}', ha='center', va='bottom')

        plt.tight_layout()
        chart_path = self.report_dir / 'comparison_charts.png'
        plt.savefig(chart_path, dpi=300, bbox_inches='tight')
        plt.close()
        print(f"  ✓ 保存图表: {chart_path}")

        # 2. 详细对比热力图
        fig, ax = plt.subplots(figsize=(14, 8))

        # 选择关键指标
        heatmap_data = df[['模型', 'mAP@50', 'mAP@50-95', 'Precision', 'Recall', 'F1 Score']].copy()
        heatmap_data = heatmap_data.set_index('模型')

        # 归一化到0-1以便对比
        heatmap_data_normalized = (heatmap_data - heatmap_data.min()) / (heatmap_data.max() - heatmap_data.min())

        sns.heatmap(heatmap_data_normalized.T, annot=heatmap_data.T, fmt='.3f',
                   cmap='RdYlGn', ax=ax, cbar_kws={'label': 'Normalized Score'},
                   linewidths=0.5)
        ax.set_title('Model Performance Heatmap', fontsize=14, fontweight='bold')
        ax.set_xlabel('Model', fontsize=12)
        ax.set_ylabel('Metrics', fontsize=12)

        plt.tight_layout()
        heatmap_path = self.report_dir / 'performance_heatmap.png'
        plt.savefig(heatmap_path, dpi=300, bbox_inches='tight')
        plt.close()
        print(f"  ✓ 保存热力图: {heatmap_path}")

        # 3. 参数影响分析
        if len(df['Epochs'].unique()) > 1 or len(df['Batch'].unique()) > 1:
            fig, axes = plt.subplots(1, 2, figsize=(16, 6))

            # Epochs影响
            if len(df['Epochs'].unique()) > 1:
                ax = axes[0]
                for model in df['模型'].unique():
                    model_data = df[df['模型'] == model].sort_values('Epochs')
                    ax.plot(model_data['Epochs'], model_data['mAP@50'],
                           marker='o', label=model, linewidth=2)
                ax.set_title('Impact of Training Epochs on mAP@50', fontsize=14, fontweight='bold')
                ax.set_xlabel('Epochs', fontsize=12)
                ax.set_ylabel('mAP@50', fontsize=12)
                ax.legend()
                ax.grid(True, alpha=0.3)

            # Batch size影响
            if len(df['Batch'].unique()) > 1:
                ax = axes[1]
                for model in df['模型'].unique():
                    model_data = df[df['模型'] == model].sort_values('Batch')
                    if len(model_data) > 1:
                        ax.plot(model_data['Batch'], model_data['mAP@50'],
                               marker='o', label=model, linewidth=2)
                ax.set_title('Impact of Batch Size on mAP@50', fontsize=14, fontweight='bold')
                ax.set_xlabel('Batch Size', fontsize=12)
                ax.set_ylabel('mAP@50', fontsize=12)
                ax.legend()
                ax.grid(True, alpha=0.3)

            plt.tight_layout()
            param_path = self.report_dir / 'parameter_impact.png'
            plt.savefig(param_path, dpi=300, bbox_inches='tight')
            plt.close()
            print(f"  ✓ 保存参数影响图: {param_path}")

    def _create_per_class_charts(self):
        """创建per-class对比图表"""
        print("\n  生成per-class对比图表...")

        # 收集所有实验的per-class数据
        all_class_names = set()
        per_class_data = []

        for result in self.results:
            metrics = result['metrics']
            if 'class_names' in metrics and metrics['class_names']:
                all_class_names.update(metrics['class_names'])
                per_class_data.append({
                    'model': metrics['model_size'],
                    'epochs': metrics['epochs'],
                    'batch': metrics['batch'],
                    'run_name': result['run_name'],
                    'class_names': metrics['class_names'],
                    'per_class': metrics.get('per_class', {})
                })

        if not per_class_data or not all_class_names:
            print("    ✗ 没有per-class数据，跳过")
            return

        class_names = sorted(all_class_names)
        n_classes = len(class_names)

        print(f"    发现 {n_classes} 个类别: {', '.join(class_names)}")

        # 创建per-class AP50对比图
        fig, axes = plt.subplots(2, 2, figsize=(18, 14))

        # 1. Per-class AP50柱状图
        ax = axes[0, 0]
        width = 0.8 / max(len(per_class_data), 1)
        x = np.arange(n_classes)

        for i, data in enumerate(per_class_data):
            ap50_values = []
            ap50_list = data['per_class'].get('ap50', [])
            for cls_name in class_names:
                if cls_name in data['class_names']:
                    idx = data['class_names'].index(cls_name)
                    if idx < len(ap50_list):
                        ap50_values.append(ap50_list[idx])
                    else:
                        ap50_values.append(0)
                else:
                    ap50_values.append(0)

            offset = width * i - width * len(per_class_data) / 2
            ax.bar(x + offset, ap50_values, width,
                   label=f"{data['model']}(e{data['epochs']})", alpha=0.8)

        ax.set_xlabel('Class', fontsize=12)
        ax.set_ylabel('AP@50', fontsize=12)
        ax.set_title('Per-Class AP@50 Comparison', fontsize=14, fontweight='bold')
        ax.set_xticks(x)
        ax.set_xticklabels(class_names, rotation=45, ha='right')
        ax.legend(fontsize=9)
        ax.grid(True, alpha=0.3, axis='y')
        ax.set_ylim([0, 1.0])

        # 2. Per-class Precision柱状图
        ax = axes[0, 1]
        for i, data in enumerate(per_class_data):
            precision_values = []
            precision_list = data['per_class'].get('precision', [])
            for cls_name in class_names:
                if cls_name in data['class_names']:
                    idx = data['class_names'].index(cls_name)
                    if idx < len(precision_list):
                        precision_values.append(precision_list[idx])
                    else:
                        precision_values.append(0)
                else:
                    precision_values.append(0)

            offset = width * i - width * len(per_class_data) / 2
            ax.bar(x + offset, precision_values, width,
                   label=f"{data['model']}(e{data['epochs']})", alpha=0.8)

        ax.set_xlabel('Class', fontsize=12)
        ax.set_ylabel('Precision', fontsize=12)
        ax.set_title('Per-Class Precision Comparison', fontsize=14, fontweight='bold')
        ax.set_xticks(x)
        ax.set_xticklabels(class_names, rotation=45, ha='right')
        ax.legend(fontsize=9)
        ax.grid(True, alpha=0.3, axis='y')
        ax.set_ylim([0, 1.0])

        # 3. Per-class Recall柱状图
        ax = axes[1, 0]
        for i, data in enumerate(per_class_data):
            recall_values = []
            recall_list = data['per_class'].get('recall', [])
            for cls_name in class_names:
                if cls_name in data['class_names']:
                    idx = data['class_names'].index(cls_name)
                    if idx < len(recall_list):
                        recall_values.append(recall_list[idx])
                    else:
                        recall_values.append(0)
                else:
                    recall_values.append(0)

            offset = width * i - width * len(per_class_data) / 2
            ax.bar(x + offset, recall_values, width,
                   label=f"{data['model']}(e{data['epochs']})", alpha=0.8)

        ax.set_xlabel('Class', fontsize=12)
        ax.set_ylabel('Recall', fontsize=12)
        ax.set_title('Per-Class Recall Comparison', fontsize=14, fontweight='bold')
        ax.set_xticks(x)
        ax.set_xticklabels(class_names, rotation=45, ha='right')
        ax.legend(fontsize=9)
        ax.grid(True, alpha=0.3, axis='y')
        ax.set_ylim([0, 1.0])

        # 4. 最佳模型的per-class热力图
        ax = axes[1, 1]
        # 找到整体mAP最高的实验
        best_data = max(per_class_data,
                        key=lambda x: np.mean(x['per_class'].get('ap50', [0])))

        # 准备热力图数据
        heatmap_data = []
        metric_names = []
        if 'ap50' in best_data['per_class']:
            heatmap_data.append(best_data['per_class']['ap50'])
            metric_names.append('AP50')
        if 'precision' in best_data['per_class']:
            heatmap_data.append(best_data['per_class']['precision'])
            metric_names.append('Precision')
        if 'recall' in best_data['per_class']:
            heatmap_data.append(best_data['per_class']['recall'])
            metric_names.append('Recall')

        if heatmap_data:
            heatmap_array = np.array(heatmap_data)
            sns.heatmap(heatmap_array, annot=True, fmt='.3f', cmap='RdYlGn',
                       xticklabels=best_data['class_names'],
                       yticklabels=metric_names,
                       cbar_kws={'label': 'Score'},
                       ax=ax, vmin=0, vmax=1.0)
            ax.set_title(f"Best Model Per-Class Metrics\n({best_data['model']}, {best_data['epochs']} epochs)",
                        fontsize=12, fontweight='bold')

        plt.tight_layout()
        chart_path = self.report_dir / 'per_class_comparison.png'
        plt.savefig(chart_path, dpi=300, bbox_inches='tight')
        plt.close()
        print(f"    ✓ 保存per-class对比图: {chart_path}")

    def generate_html_report(self, df: pd.DataFrame):
        """生成HTML报告"""
        print("\n生成HTML报告...")

        # 找到最佳模型
        best_idx = df['mAP@50'].idxmax()
        best_model = df.loc[best_idx]

        html = f"""
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>YOLO11 模型综合对比报告</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
        }}

        .container {{
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}

        h1 {{
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 15px;
            margin-bottom: 30px;
            font-size: 2.5em;
        }}

        h2 {{
            color: #34495e;
            margin-top: 40px;
            margin-bottom: 20px;
            font-size: 1.8em;
            border-left: 4px solid #3498db;
            padding-left: 15px;
        }}

        h3 {{
            color: #7f8c8d;
            margin-top: 25px;
            margin-bottom: 15px;
            font-size: 1.3em;
        }}

        .summary {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 8px;
            margin-bottom: 30px;
        }}

        .summary h2 {{
            color: white;
            border: none;
            margin-top: 0;
        }}

        .summary-stats {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }}

        .stat-box {{
            background: rgba(255,255,255,0.2);
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }}

        .stat-box .label {{
            font-size: 0.9em;
            opacity: 0.9;
            margin-bottom: 8px;
        }}

        .stat-box .value {{
            font-size: 2em;
            font-weight: bold;
        }}

        .best-model {{
            background: #f8f9fa;
            border-left: 4px solid #27ae60;
            padding: 25px;
            margin: 25px 0;
            border-radius: 5px;
        }}

        .best-model h3 {{
            color: #27ae60;
            margin-top: 0;
        }}

        .metric-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }}

        .metric-item {{
            background: white;
            padding: 15px;
            border-radius: 5px;
            border: 1px solid #e0e0e0;
        }}

        .metric-item .label {{
            color: #7f8c8d;
            font-size: 0.9em;
            margin-bottom: 5px;
        }}

        .metric-item .value {{
            color: #2c3e50;
            font-size: 1.5em;
            font-weight: bold;
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 25px 0;
            font-size: 0.95em;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }}

        thead tr {{
            background: #3498db;
            color: white;
            text-align: left;
        }}

        th, td {{
            padding: 12px 15px;
        }}

        tbody tr {{
            border-bottom: 1px solid #dddddd;
        }}

        tbody tr:nth-of-type(even) {{
            background: #f8f9fa;
        }}

        tbody tr:hover {{
            background: #e3f2fd;
        }}

        tbody tr.best-row {{
            background: #d4edda !important;
            font-weight: bold;
        }}

        .chart {{
            margin: 30px 0;
            text-align: center;
        }}

        .chart img {{
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}

        .info-box {{
            background: #e3f2fd;
            border-left: 4px solid #2196f3;
            padding: 20px;
            margin: 20px 0;
            border-radius: 5px;
        }}

        .warning-box {{
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 20px;
            margin: 20px 0;
            border-radius: 5px;
        }}

        .footer {{
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            text-align: center;
            color: #7f8c8d;
            font-size: 0.9em;
        }}

        .badge {{
            display: inline-block;
            padding: 3px 8px;
            border-radius: 3px;
            font-size: 0.85em;
            font-weight: bold;
        }}

        .badge-success {{
            background: #d4edda;
            color: #155724;
        }}

        .badge-info {{
            background: #d1ecf1;
            color: #0c5460;
        }}

        .badge-warning {{
            background: #fff3cd;
            color: #856404;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🎯 YOLO11 模型综合对比报告</h1>

        <div class="summary">
            <h2>📊 实验概览</h2>
            <div class="summary-stats">
                <div class="stat-box">
                    <div class="label">总实验数</div>
                    <div class="value">{len(df)}</div>
                </div>
                <div class="stat-box">
                    <div class="label">测试模型数</div>
                    <div class="value">{df['模型'].nunique()}</div>
                </div>
                <div class="stat-box">
                    <div class="label">最高 mAP@50</div>
                    <div class="value">{df['mAP@50'].max():.3f}</div>
                </div>
                <div class="stat-box">
                    <div class="label">总训练时间</div>
                    <div class="value">{df['训练时间(分)'].sum():.0f}分</div>
                </div>
            </div>
            <p style="margin-top: 20px; opacity: 0.9;">
                生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
            </p>
        </div>

        <div class="best-model">
            <h3>🏆 最佳模型推荐</h3>
            <p><strong>模型:</strong> <span class="badge badge-success">{best_model['模型']}</span></p>
            <p><strong>配置:</strong> Epochs={best_model['Epochs']}, Batch={best_model['Batch']}, ImgSize={best_model['ImgSize']}</p>
            <p><strong>运行名称:</strong> <code>{best_model['运行名称']}</code></p>

            <div class="metric-grid">
                <div class="metric-item">
                    <div class="label">mAP@50</div>
                    <div class="value">{best_model['mAP@50']:.4f}</div>
                </div>
                <div class="metric-item">
                    <div class="label">mAP@50-95</div>
                    <div class="value">{best_model['mAP@50-95']:.4f}</div>
                </div>
                <div class="metric-item">
                    <div class="label">Precision</div>
                    <div class="value">{best_model['Precision']:.4f}</div>
                </div>
                <div class="metric-item">
                    <div class="label">Recall</div>
                    <div class="value">{best_model['Recall']:.4f}</div>
                </div>
                <div class="metric-item">
                    <div class="label">F1 Score</div>
                    <div class="value">{best_model['F1 Score']:.4f}</div>
                </div>
                <div class="metric-item">
                    <div class="label">训练时间</div>
                    <div class="value">{best_model['训练时间(分)']:.1f}分</div>
                </div>
            </div>
        </div>

        <h2>📈 性能对比可视化</h2>
        <div class="chart">
            <h3>综合性能对比</h3>
            <img src="comparison_charts.png" alt="综合性能对比图">
        </div>

        <div class="chart">
            <h3>性能热力图</h3>
            <img src="performance_heatmap.png" alt="性能热力图">
        </div>
"""

        # 添加参数影响图（如果存在）
        if (self.report_dir / 'parameter_impact.png').exists():
            html += """
        <div class="chart">
            <h3>参数影响分析</h3>
            <img src="parameter_impact.png" alt="参数影响分析">
        </div>
"""

        html += f"""
        <h2>📋 详细对比表格</h2>
        <table>
            <thead>
                <tr>
                    <th>模型</th>
                    <th>Epochs</th>
                    <th>Batch</th>
                    <th>ImgSize</th>
                    <th>增强</th>
                    <th>mAP@50</th>
                    <th>mAP@50-95</th>
                    <th>Precision</th>
                    <th>Recall</th>
                    <th>F1 Score</th>
                    <th>训练时间</th>
                </tr>
            </thead>
            <tbody>
"""

        for idx, row in df.iterrows():
            row_class = 'best-row' if idx == best_idx else ''
            html += f"""
                <tr class="{row_class}">
                    <td><span class="badge badge-info">{row['模型']}</span></td>
                    <td>{row['Epochs']}</td>
                    <td>{row['Batch']}</td>
                    <td>{row['ImgSize']}</td>
                    <td>{row['数据增强']}</td>
                    <td>{row['mAP@50']:.4f}</td>
                    <td>{row['mAP@50-95']:.4f}</td>
                    <td>{row['Precision']:.4f}</td>
                    <td>{row['Recall']:.4f}</td>
                    <td>{row['F1 Score']:.4f}</td>
                    <td>{row['训练时间(分)']:.1f}分</td>
                </tr>
"""

        html += """
            </tbody>
        </table>
"""

        # 添加分析和建议
        html += """
        <h2>💡 分析与建议</h2>

        <h3>模型选择建议</h3>
"""

        # 按场景分析
        scenarios = {
            '边缘设备/实时检测': df[df['模型'].isin(['nano', 'small'])].nlargest(1, 'mAP@50'),
            '服务器部署/高精度': df[df['模型'].isin(['medium', 'large'])].nlargest(1, 'mAP@50'),
            '最快训练速度': df.nsmallest(1, '训练时间(分)'),
            '最高精度': df.nlargest(1, 'mAP@50')
        }

        for scenario, model_df in scenarios.items():
            if not model_df.empty:
                model = model_df.iloc[0]
                html += f"""
        <div class="info-box">
            <strong>{scenario}:</strong> 推荐使用 <strong>{model['模型']}</strong> 模型
            <br>mAP@50: {model['mAP@50']:.4f}, Precision: {model['Precision']:.4f}, Recall: {model['Recall']:.4f}
        </div>
"""

        # 性能趋势分析
        html += """
        <h3>性能趋势</h3>
        <ul>
"""

        # 模型大小影响
        model_perf = df.groupby('模型')[['mAP@50', '训练时间(分)']].mean()
        html += f"""
            <li><strong>模型大小影响:</strong>
"""
        for model in model_perf.index:
            html += f"{model} (mAP: {model_perf.loc[model, 'mAP@50']:.3f}), "
        html += "</li>"

        # Epochs影响
        if len(df['Epochs'].unique()) > 1:
            epochs_perf = df.groupby('Epochs')['mAP@50'].mean()
            html += f"""
            <li><strong>训练轮数影响:</strong>
"""
            for epoch in sorted(epochs_perf.index):
                html += f"{epoch}轮 (mAP: {epochs_perf[epoch]:.3f}), "
            html += "</li>"

        # 数据增强影响
        if df['数据增强'].nunique() > 1:
            aug_perf = df.groupby('数据增强')['mAP@50'].mean()
            html += f"""
            <li><strong>数据增强影响:</strong>
                不增强 (mAP: {aug_perf.get('否', 0):.3f}) vs
                增强 (mAP: {aug_perf.get('是', 0):.3f})
                - 提升: {(aug_perf.get('是', 0) - aug_perf.get('否', 0)):.3f}
            </li>
"""

        html += """
        </ul>

        <h3>优化建议</h3>
        <div class="warning-box">
            <ul>
                <li>如果精度不够: 尝试更大的模型(medium/large)或增加训练轮数</li>
                <li>如果训练太慢: 使用较小的模型(nano/small)或减小图片尺寸</li>
                <li>如果过拟合: 启用数据增强或使用更小的模型</li>
                <li>如果欠拟合: 增加模型容量或延长训练时间</li>
            </ul>
        </div>

        <div class="footer">
            <p>报告生成工具: comprehensive_model_comparison.py v2.0</p>
            <p>基于 YOLO11 的漆面缺陷检测系统</p>
        </div>
    </div>
</body>
</html>
"""

        report_path = self.report_dir / 'comparison_report.html'
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(html)

        print(f"  ✓ HTML报告: {report_path}")

    def generate_markdown_report(self, df: pd.DataFrame):
        """生成Markdown报告"""
        print("\n生成Markdown报告...")

        best_idx = df['mAP@50'].idxmax()
        best_model = df.loc[best_idx]

        md = f"""# YOLO11 模型综合对比报告

生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

---

## 📊 实验概览

- **总实验数**: {len(df)}
- **测试模型数**: {df['模型'].nunique()}
- **最高 mAP@50**: {df['mAP@50'].max():.4f}
- **总训练时间**: {df['训练时间(分)'].sum():.1f} 分钟 ({df['训练时间(分)'].sum()/60:.1f} 小时)

---

## 🏆 最佳模型

**模型**: {best_model['模型']}

**配置**:
- Epochs: {best_model['Epochs']}
- Batch Size: {best_model['Batch']}
- Image Size: {best_model['ImgSize']}
- 数据增强: {best_model['数据增强']}

**性能指标**:
- mAP@50: **{best_model['mAP@50']:.4f}**
- mAP@50-95: {best_model['mAP@50-95']:.4f}
- Precision: {best_model['Precision']:.4f}
- Recall: {best_model['Recall']:.4f}
- F1 Score: {best_model['F1 Score']:.4f}
- 训练时间: {best_model['训练时间(分)']:.1f} 分钟

**运行名称**: `{best_model['运行名称']}`

---

## 📋 详细对比表格

"""

        # 创建Markdown表格
        md += "| 模型 | Epochs | Batch | ImgSize | 增强 | mAP@50 | mAP@50-95 | Precision | Recall | F1 | 训练时间(分) |\n"
        md += "|------|--------|-------|---------|------|--------|-----------|-----------|--------|----|--------------|\n"

        for idx, row in df.iterrows():
            marker = "**" if idx == best_idx else ""
            md += f"| {marker}{row['模型']}{marker} | {row['Epochs']} | {row['Batch']} | {row['ImgSize']} | {row['数据增强']} | "
            md += f"{row['mAP@50']:.4f} | {row['mAP@50-95']:.4f} | {row['Precision']:.4f} | {row['Recall']:.4f} | "
            md += f"{row['F1 Score']:.4f} | {row['训练时间(分)']:.1f} |\n"

        md += "\n---\n\n## 📈 性能对比可视化\n\n"
        md += "### 综合性能对比\n\n"
        md += "![综合性能对比](comparison_charts.png)\n\n"
        md += "### 性能热力图\n\n"
        md += "![性能热力图](performance_heatmap.png)\n\n"

        if (self.report_dir / 'parameter_impact.png').exists():
            md += "### 参数影响分析\n\n"
            md += "![参数影响分析](parameter_impact.png)\n\n"

        # 添加统计分析
        md += "---\n\n## 📊 统计分析\n\n"

        # 按模型统计
        md += "### 不同模型性能\n\n"
        model_stats = df.groupby('模型').agg({
            'mAP@50': ['mean', 'std', 'max'],
            'Precision': 'mean',
            'Recall': 'mean',
            '训练时间(分)': 'mean'
        }).round(4)

        md += "| 模型 | mAP@50 (均值) | mAP@50 (标准差) | mAP@50 (最大) | Precision | Recall | 平均训练时间 |\n"
        md += "|------|---------------|----------------|--------------|-----------|--------|-------------|\n"

        for model in model_stats.index:
            md += f"| {model} | {model_stats.loc[model, ('mAP@50', 'mean')]:.4f} | "
            md += f"{model_stats.loc[model, ('mAP@50', 'std')]:.4f} | "
            md += f"{model_stats.loc[model, ('mAP@50', 'max')]:.4f} | "
            md += f"{model_stats.loc[model, ('Precision', 'mean')]:.4f} | "
            md += f"{model_stats.loc[model, ('Recall', 'mean')]:.4f} | "
            md += f"{model_stats.loc[model, ('训练时间(分)', 'mean')]:.1f}分 |\n"

        # 参数影响分析
        if len(df['Epochs'].unique()) > 1:
            md += "\n### 训练轮数影响\n\n"
            epochs_stats = df.groupby('Epochs')['mAP@50'].agg(['mean', 'std', 'count']).round(4)
            md += "| Epochs | mAP@50 (均值) | 标准差 | 实验数 |\n"
            md += "|--------|---------------|--------|--------|\n"
            for epochs in sorted(epochs_stats.index):
                md += f"| {epochs} | {epochs_stats.loc[epochs, 'mean']:.4f} | "
                md += f"{epochs_stats.loc[epochs, 'std']:.4f} | {int(epochs_stats.loc[epochs, 'count'])} |\n"

        if df['数据增强'].nunique() > 1:
            md += "\n### 数据增强影响\n\n"
            aug_stats = df.groupby('数据增强').agg({
                'mAP@50': ['mean', 'std'],
                'Precision': 'mean',
                'Recall': 'mean'
            }).round(4)

            md += "| 数据增强 | mAP@50 (均值) | 标准差 | Precision | Recall |\n"
            md += "|---------|---------------|--------|-----------|--------|\n"
            for aug in aug_stats.index:
                md += f"| {aug} | {aug_stats.loc[aug, ('mAP@50', 'mean')]:.4f} | "
                md += f"{aug_stats.loc[aug, ('mAP@50', 'std')]:.4f} | "
                md += f"{aug_stats.loc[aug, ('Precision', 'mean')]:.4f} | "
                md += f"{aug_stats.loc[aug, ('Recall', 'mean')]:.4f} |\n"

        # 添加建议
        md += "\n---\n\n## 💡 建议与结论\n\n"

        md += "### 场景推荐\n\n"

        scenarios = {
            '边缘设备/实时检测': df[df['模型'].isin(['nano', 'small'])].nlargest(1, 'mAP@50'),
            '服务器部署/平衡': df[df['模型'].isin(['medium'])].nlargest(1, 'mAP@50'),
            '高精度需求': df[df['模型'].isin(['large', 'x'])].nlargest(1, 'mAP@50') if not df[df['模型'].isin(['large', 'x'])].empty else df.nlargest(1, 'mAP@50')
        }

        for scenario, model_df in scenarios.items():
            if not model_df.empty:
                model = model_df.iloc[0]
                md += f"**{scenario}**:\n"
                md += f"- 推荐模型: {model['模型']}\n"
                md += f"- mAP@50: {model['mAP@50']:.4f}\n"
                md += f"- Precision: {model['Precision']:.4f}\n"
                md += f"- Recall: {model['Recall']:.4f}\n\n"

        md += "### 关键发现\n\n"

        # 模型大小对比
        model_range = df.groupby('模型')['mAP@50'].mean()
        if len(model_range) > 1:
            best_avg_model = model_range.idxmax()
            worst_avg_model = model_range.idxmin()
            improvement = ((model_range[best_avg_model] - model_range[worst_avg_model]) / model_range[worst_avg_model] * 100)
            md += f"1. **模型大小影响**: {best_avg_model} 相比 {worst_avg_model} 平均提升 {improvement:.1f}%\n"

        # 数据增强效果
        if df['数据增强'].nunique() > 1:
            aug_effect = df.groupby('数据增强')['mAP@50'].mean()
            if '是' in aug_effect.index and '否' in aug_effect.index:
                improvement = aug_effect['是'] - aug_effect['否']
                md += f"2. **数据增强效果**: 提升 mAP@50 约 {improvement:.4f} ({improvement*100:.1f}%)\n"

        # 训练时间
        fastest = df.loc[df['训练时间(分)'].idxmin()]
        slowest = df.loc[df['训练时间(分)'].idxmax()]
        md += f"3. **训练时间**: {fastest['模型']} 最快 ({fastest['训练时间(分)']:.1f}分), {slowest['模型']} 最慢 ({slowest['训练时间(分)']:.1f}分)\n"

        md += "\n### 优化建议\n\n"
        md += "1. **提高精度**: 使用更大模型、启用数据增强、增加训练轮数\n"
        md += "2. **加快训练**: 使用较小模型、减小batch size、降低图片尺寸\n"
        md += "3. **防止过拟合**: 启用数据增强、使用dropout、早停策略\n"
        md += "4. **实际部署**: 考虑精度和速度的平衡，进行实际环境测试\n"

        md += "\n---\n\n"
        md += "*报告由 comprehensive_model_comparison.py 自动生成*\n"

        report_path = self.report_dir / 'comparison_report.md'
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(md)

        print(f"  ✓ Markdown报告: {report_path}")

    def save_results(self):
        """保存结果到JSON"""
        print("\n保存实验结果...")

        results_data = {
            'timestamp': self.timestamp,
            'total_experiments': len(self.results),
            'configuration': {
                'models': self.args.models,
                'epochs': self.args.epochs,
                'batch_sizes': self.args.batch_sizes,
                'image_sizes': self.args.imgsz,
                'augment': self.args.augment,
                'data_dir': self.args.data_dir
            },
            'results': self.results
        }

        json_path = self.report_dir / 'results.json'
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(results_data, f, indent=2, ensure_ascii=False)

        print(f"  ✓ JSON结果: {json_path}")

        # 同时保存一份到主目录
        main_json = self.base_dir / f'comparison_results_{self.timestamp}.json'
        with open(main_json, 'w', encoding='utf-8') as f:
            json.dump(results_data, f, indent=2, ensure_ascii=False)
        print(f"  ✓ 副本保存至: {main_json}")

    def run(self):
        """运行完整对比流程"""
        print("="*80)
        print("YOLO11 综合模型对比系统")
        print("="*80)

        # 生成实验配置
        experiments = []
        for model in self.args.models:
            for epochs in self.args.epochs:
                for imgsz in self.args.imgsz:
                    # 确定batch sizes
                    batch_sizes = self.args.batch_sizes if self.args.batch_sizes else [self.default_batch_map.get(model, 16)]

                    for batch in batch_sizes:
                        run_name = f"comp_{model}_e{epochs}_b{batch}_img{imgsz}"
                        if self.args.augment:
                            run_name += "_aug"
                        run_name += f"_{self.timestamp}"

                        config = {
                            'model_size': model,
                            'epochs': epochs,
                            'batch': batch,
                            'imgsz': imgsz,
                            'augment': self.args.augment,
                            'data_dir': self.args.data_dir,
                            'device': self.args.device,
                            'run_name': run_name
                        }
                        experiments.append(config)

        print(f"\n实验计划:")
        print(f"  总实验数: {len(experiments)}")
        print(f"  模型: {', '.join(self.args.models)}")
        print(f"  训练轮数: {', '.join(map(str, self.args.epochs))}")
        print(f"  Batch sizes: {', '.join(map(str, self.args.batch_sizes or ['auto']))}")
        print(f"  图片尺寸: {', '.join(map(str, self.args.imgsz))}")
        print(f"  数据增强: {'是' if self.args.augment else '否'}")

        # 估算时间
        time_per_exp = {
            'nano': 30, 'small': 45, 'medium': 90, 'large': 120, 'x': 180
        }
        total_minutes = sum(time_per_exp.get(exp['model_size'], 60) * exp['epochs'] / 100
                          for exp in experiments)
        print(f"  预计总时间: {total_minutes:.0f} 分钟 ({total_minutes/60:.1f} 小时)")

        print(f"\n详细实验列表:")
        for i, exp in enumerate(experiments, 1):
            print(f"  {i}. {exp['model_size']:<8} - Epochs:{exp['epochs']:<4} Batch:{exp['batch']:<3} ImgSize:{exp['imgsz']:<4}")

        # 确认
        response = input(f"\n是否开始运行 {len(experiments)} 个实验? (yes/no): ")
        if response.lower() not in ['yes', 'y', '是']:
            print("已取消")
            return

        # 运行所有实验
        print(f"\n{'='*80}")
        print("开始实验")
        print(f"{'='*80}\n")

        for i, config in enumerate(experiments, 1):
            print(f"\n{'#'*80}")
            print(f"实验 {i}/{len(experiments)}")
            print(f"{'#'*80}")

            result = self.run_single_experiment(config)

            if result:
                self.results.append(result)
                print(f"\n✓ 实验 {i} 完成")
            else:
                print(f"\n✗ 实验 {i} 失败")

            # 保存中间结果
            if self.results:
                temp_json = self.base_dir / 'comparison_progress.json'
                with open(temp_json, 'w', encoding='utf-8') as f:
                    json.dump({
                        'completed': i,
                        'total': len(experiments),
                        'results': self.results
                    }, f, indent=2, ensure_ascii=False)

        # 生成报告
        if not self.results:
            print("\n没有成功完成的实验，无法生成报告")
            return

        print(f"\n{'='*80}")
        print("生成对比报告")
        print(f"{'='*80}\n")

        # 创建DataFrame
        df = self.generate_comparison_table()

        # 保存CSV
        csv_path = self.report_dir / 'comparison_table.csv'
        df.to_csv(csv_path, index=False, encoding='utf-8-sig')
        print(f"✓ CSV表格: {csv_path}")

        # 生成可视化
        self.create_visualizations(df)

        # 生成HTML报告
        self.generate_html_report(df)

        # 生成Markdown报告
        self.generate_markdown_report(df)

        # 保存JSON结果
        self.save_results()

        # 最终总结
        print(f"\n{'='*80}")
        print("实验完成！")
        print(f"{'='*80}\n")

        best_idx = df['mAP@50'].idxmax()
        best_model = df.loc[best_idx]

        print(f"🏆 最佳模型: {best_model['模型']}")
        print(f"   mAP@50: {best_model['mAP@50']:.4f}")
        print(f"   Precision: {best_model['Precision']:.4f}")
        print(f"   Recall: {best_model['Recall']:.4f}")
        print(f"   F1 Score: {best_model['F1 Score']:.4f}")
        print(f"   配置: Epochs={best_model['Epochs']}, Batch={best_model['Batch']}, ImgSize={best_model['ImgSize']}")

        print(f"\n📁 报告目录: {self.report_dir}")
        print(f"   - comparison_report.html (推荐查看)")
        print(f"   - comparison_report.md")
        print(f"   - comparison_table.csv")
        print(f"   - comparison_charts.png")
        print(f"   - performance_heatmap.png")
        print(f"   - results.json")

        print(f"\n提示: 在浏览器中打开 {self.report_dir / 'comparison_report.html'} 查看详细报告")


def parse_arguments():
    """解析命令行参数"""
    parser = argparse.ArgumentParser(
        description='YOLO11 综合模型对比工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 默认运行（对比所有模型，启用数据增强）
  python3 comprehensive_model_comparison.py

  # 基础对比
  python3 comprehensive_model_comparison.py --preset basic

  # 标准对比
  python3 comprehensive_model_comparison.py --preset standard

  # 完整对比
  python3 comprehensive_model_comparison.py --preset full

  # 自定义（明确禁用数据增强）
  python3 comprehensive_model_comparison.py \\
      --models nano small \\
      --epochs 100 \\
      --no-augment

  # 自定义（使用默认增强设置）
  python3 comprehensive_model_comparison.py \\
      --models medium large \\
      --epochs 150 200
        """
    )

    # 预设模式
    parser.add_argument('--preset', type=str, choices=['basic', 'standard', 'full'],
                       help='预设对比模式: basic(基础), standard(标准), full(完整)')

    # 自定义参数
    parser.add_argument('--models', nargs='+',
                       choices=['nano', 'small', 'medium', 'large', 'x'],
                       help='要对比的模型列表')
    parser.add_argument('--epochs', nargs='+', type=int,
                       help='训练轮数列表 (例如: 100 150)')
    parser.add_argument('--batch_sizes', nargs='+', type=int,
                       help='批次大小列表 (例如: 8 16), 默认根据模型自动选择')
    parser.add_argument('--imgsz', nargs='+', type=int,
                       help='图片尺寸列表 (例如: 640 800)')
    parser.add_argument('--augment', action='store_true', default=None,
                       help='启用数据增强 (默认: 启用)')
    parser.add_argument('--no-augment', dest='augment', action='store_false',
                       help='禁用数据增强')
    parser.add_argument('--data_dir', type=str, default='dataset_raw',
                       help='数据目录 (默认: dataset_raw)')
    parser.add_argument('--device', type=str, default='cuda',
                       help='训练设备 (默认: cuda)')

    args = parser.parse_args()

    # 根据预设模式设置参数
    if args.preset == 'basic':
        args.models = args.models or ['nano', 'small', 'medium']
        args.epochs = args.epochs or [100]
        args.imgsz = args.imgsz or [640]
        if args.augment is None:
            args.augment = True
        print("使用基础对比模式")

    elif args.preset == 'standard':
        args.models = args.models or ['nano', 'small', 'medium', 'large']
        args.epochs = args.epochs or [100, 150]
        args.imgsz = args.imgsz or [640]
        if args.augment is None:
            args.augment = True
        print("使用标准对比模式")

    elif args.preset == 'full':
        args.models = args.models or ['nano', 'small', 'medium', 'large']
        args.epochs = args.epochs or [50, 100, 150]
        args.imgsz = args.imgsz or [640, 800]
        if args.augment is None:
            args.augment = True
        print("使用完整对比模式")

    else:
        # 自定义/默认模式：如果用户没有配置，使用智能默认值
        # 默认对比所有主流模型，启用数据增强
        args.models = args.models or ['nano', 'small', 'medium', 'large']
        args.epochs = args.epochs or [100]
        args.imgsz = args.imgsz or [640]

        # 如果用户没有明确指定是否增强，默认启用
        if args.augment is None:
            args.augment = True

        print("使用默认对比模式（对比所有模型，启用数据增强）")

    return args


def main():
    """主函数"""
    try:
        args = parse_arguments()
        comparison = ComprehensiveModelComparison(args)
        comparison.run()

    except KeyboardInterrupt:
        print("\n\n用户中断实验")
        sys.exit(1)
    except Exception as e:
        print(f"\n错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
