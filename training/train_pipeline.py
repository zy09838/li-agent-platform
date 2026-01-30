#!/usr/bin/env python3
"""
漆面缺陷检测 - 统一训练流程

功能：
1. 自动从标注文件中提取所有类别
2. 准备YOLO格式数据集
3. 可选数据增强
4. 训练模型
5. 对所有数据进行预测

使用方法：
    python train_pipeline.py --data_dir dataset_raw --epochs 100 --augment
    python train_pipeline.py --data_dir dataset_raw --model_size medium --epochs 100
    python train_pipeline.py --data_dir dataset_raw --model_size large --epochs 100 --augment --device cuda
    
参数说明：
    --data_dir: 数据目录，包含 images/ 和 annotations/ 子目录
    --epochs: 训练轮数，默认100
    --augment: 是否启用数据增强，默认不启用
    --model_size: 模型大小选择 (nano/small/medium/large/x)，默认nano
    --train_ratio: 训练集比例，默认0.8
    --imgsz: 图片尺寸，默认640
    --batch: 批次大小，默认16（medium模型建议8-12）
    --conf: 预测置信度阈值，默认0.25
    --model: 自定义预训练模型路径（优先级高于model_size）
    --name: 运行名称，默认自动生成
    --device: 训练设备，cuda(自动选择GPU)/cpu/具体GPU编号(如0,1)，默认自动检测
    --no_predict: 训练后不进行预测
"""

import argparse
import json
import os
import shutil
import cv2
import random
import numpy as np
from datetime import datetime
from pathlib import Path


def imread_unicode(img_path):
    """读取包含中文路径的图片"""
    img_path = Path(img_path)
    img_array = np.fromfile(str(img_path), dtype=np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    return img


def imwrite_unicode(img_path, img):
    """保存图片到包含中文的路径"""
    img_path = Path(img_path)
    ext = img_path.suffix
    is_success, img_array = cv2.imencode(ext, img)
    if is_success:
        img_array.tofile(str(img_path))
        return True
    return False


def parse_args():
    parser = argparse.ArgumentParser(description='漆面缺陷检测训练流程')
    parser.add_argument('--data_dir', type=str, default='dataset_raw',
                        help='数据目录路径，包含 images/ 和 annotations/ 子目录')
    parser.add_argument('--epochs', type=int, default=100,
                        help='训练轮数 (默认: 100)')
    parser.add_argument('--augment', action='store_true',
                        help='是否启用数据增强')
    parser.add_argument('--model_size', type=str, default='nano',
                        choices=['nano', 'small', 'medium', 'large', 'x', 'v8nano', 'v8small', 'v8medium', 'v8large', 'v8x'],
                        help='模型大小: nano/small/medium/large/x(YOLO11), v8nano/v8medium(YOLOv8) (默认: nano-YOLO11)')
    parser.add_argument('--yolo_version', type=str, default='11',
                        choices=['8', '11'],
                        help='YOLO版本: 8(YOLOv8) 或 11(YOLO11) (默认: 11)')
    parser.add_argument('--train_ratio', type=float, default=0.7,
                        help='训练集比例 (默认: 0.7)')
    parser.add_argument('--val_ratio', type=float, default=0.15,
                        help='验证集比例，用于早停 (默认: 0.15)')
    parser.add_argument('--test_ratio', type=float, default=0.15,
                        help='测试集比例，用于最终评估 (默认: 0.15)')
    parser.add_argument('--imgsz', type=int, default=640,
                        help='图片尺寸 (默认: 640)')
    parser.add_argument('--batch', type=int, default=None,
                        help='批次大小 (默认: nano=16, medium=8)')
    parser.add_argument('--conf', type=float, default=0.25,
                        help='预测置信度阈值 (默认: 0.25)')
    parser.add_argument('--model', type=str, default=None,
                        help='自定义预训练模型路径（优先级高于--model_size）')
    parser.add_argument('--name', type=str, default=None,
                        help='运行名称，默认自动生成')
    parser.add_argument('--no_predict', action='store_true',
                        help='训练后不进行预测')
    parser.add_argument('--include_positive', action='store_true',
                        help='将未标注的图片作为正样本（无缺陷）参与训练')
    parser.add_argument('--device', type=str, default=None,
                        help='训练设备: cuda(自动选择GPU), cpu, 或具体GPU编号如0,1 (默认: 自动检测)')
    
    args = parser.parse_args()
    
    # 模型大小映射 - 支持YOLOv8和YOLOv11
    MODEL_MAP = {
        'nano': 'yolo11n.pt',
        'small': 'yolo11s.pt',
        'medium': 'yolo11m.pt',
        'large': 'yolo11l.pt',
        'x': 'yolo11x.pt',
        # 兼容旧版YOLOv8
        'v8nano': 'yolov8n.pt',
        'v8small': 'yolov8s.pt',
        'v8medium': 'yolov8m.pt',
        'v8large': 'yolov8l.pt',
        'v8x': 'yolov8x.pt'
    }
    
    # 根据模型大小设置默认批次
    BATCH_MAP = {
        'nano': 16,
        'small': 12,
        'medium': 8,
        'large': 6,
        'x': 4
    }
    
    # 如果没有指定自定义模型，使用model_size选择
    if args.model is None:
        args.model = MODEL_MAP[args.model_size]
    
    # 如果没有指定batch，根据模型大小设置默认值
    if args.batch is None:
        args.batch = BATCH_MAP.get(args.model_size, 16)
    
    # 处理device参数
    if args.device is None:
        # 自动检测GPU
        try:
            import torch
            if torch.cuda.is_available():
                args.device = 'cuda'
            else:
                args.device = 'cpu'
        except ImportError:
            args.device = 'cpu'
    elif args.device.lower() == 'cuda':
        # 确保CUDA可用
        try:
            import torch
            if not torch.cuda.is_available():
                print("警告: CUDA不可用，将使用CPU")
                args.device = 'cpu'
        except ImportError:
            print("警告: 无法导入torch，将使用CPU")
            args.device = 'cpu'
    
    return args


class DefectDetectionPipeline:
    # 支持的图片格式
    SUPPORTED_EXTENSIONS = {
        '.jpg', '.jpeg', '.png', '.bmp', 
        '.tif', '.tiff', '.webp',
        '.JPG', '.JPEG', '.PNG', '.BMP',
        '.TIF', '.TIFF', '.WEBP'
    }
    
    def __init__(self, args):
        self.args = args
        self.base_dir = Path(__file__).parent.absolute()
        self.data_dir = self.base_dir / args.data_dir
        self.image_dir = self.data_dir / 'images'
        self.annotation_dir = self.data_dir / 'annotations'
        
        # 生成运行名称
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        aug_suffix = "_aug" if args.augment else ""
        model_suffix = f"_{args.model_size}" if args.model_size else ""
        self.run_name = args.name or f"train_{timestamp}{model_suffix}{aug_suffix}"
        
        # 输出目录
        self.dataset_dir = self.base_dir / f'datasets_{self.run_name}'
        self.runs_dir = self.base_dir / 'runs'
        
        # 类别映射（动态生成）
        self.label_map = {}
        
        # 测试集数据（用于最终评估）
        self.test_pairs = []
        
    def collect_labels(self):
        """从所有标注文件中收集类别"""
        print("=" * 60)
        print("Step 1: 收集类别信息")
        print("=" * 60)
        
        labels = set()
        ann_files = list(self.annotation_dir.glob('*.json'))
        
        for ann_file in ann_files:
            with open(ann_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            for ann in data.get('annotations', []):
                if ann.get('type') == 'bbox':
                    label = ann.get('label', '')
                    if label:
                        labels.add(label)
        
        # 创建类别映射
        for i, label in enumerate(sorted(labels)):
            self.label_map[label] = i
        
        print(f"发现 {len(self.label_map)} 个类别:")
        for label, idx in sorted(self.label_map.items(), key=lambda x: x[1]):
            print(f"  {idx}: {label}")
        
        return self.label_map
    
    def collect_positive_samples(self):
        """收集未标注的图片作为正样本（无缺陷图片）"""
        if not self.args.include_positive:
            return []
        
        print("\n" + "=" * 60)
        print("Step 1.5: 收集正样本（未标注图片）")
        print("=" * 60)
        
        # 收集所有图片
        all_images = set()
        for ext in self.SUPPORTED_EXTENSIONS:
            for img_file in self.image_dir.glob(f'*{ext}'):
                all_images.add(img_file)
        
        # 收集已标注的图片名
        annotated_images = set()
        for ann_file in self.annotation_dir.glob('*.json'):
            with open(ann_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            img_name = data.get('imageName', '')
            if img_name:
                img_path = self.image_dir / img_name
                if img_path.exists():
                    annotated_images.add(img_path)
                else:
                    # 尝试不同的扩展名
                    base_name = Path(img_name).stem
                    for ext in self.SUPPORTED_EXTENSIONS:
                        alt_path = self.image_dir / (base_name + ext)
                        if alt_path.exists():
                            annotated_images.add(alt_path)
                            break
        
        # 未标注的图片即为正样本
        positive_samples = list(all_images - annotated_images)
        
        print(f"总图片数: {len(all_images)}")
        print(f"已标注图片数: {len(annotated_images)}")
        print(f"正样本（未标注）: {len(positive_samples)} 张")
        
        return positive_samples
    
    def prepare_dataset(self):
        """准备YOLO格式数据集 - 三分数据集版本"""
        print("\n" + "=" * 60)
        print("Step 2: 准备数据集（三分数据集）")
        print("=" * 60)
        
        # 清理并创建目录 - 支持 train/val/test
        if self.dataset_dir.exists():
            shutil.rmtree(self.dataset_dir)
        
        for split in ['train', 'val', 'test']:
            (self.dataset_dir / 'images' / split).mkdir(parents=True, exist_ok=True)
            (self.dataset_dir / 'labels' / split).mkdir(parents=True, exist_ok=True)
        
        # 收集有效的数据对 - 支持更多图片格式
        valid_pairs = []
        ann_files = sorted(self.annotation_dir.glob('*.json'))
        
        # 支持的图片格式
        supported_exts = list(self.SUPPORTED_EXTENSIONS)
        
        for ann_file in ann_files:
            with open(ann_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            img_name = data.get('imageName', '')
            if not img_name:
                continue
            
            img_path = self.image_dir / img_name
            if not img_path.exists():
                # 尝试所有支持的扩展名
                base_name = img_path.stem
                for ext in supported_exts:
                    alt_path = self.image_dir / (base_name + ext)
                    if alt_path.exists():
                        img_path = alt_path
                        img_name = alt_path.name
                        break
            
            if img_path.exists():
                valid_pairs.append((ann_file, img_path, img_name, data))
        
        print(f"找到 {len(valid_pairs)} 个有效数据对")
        
        # 统计图片格式分布
        format_counts = {}
        for _, img_path, _, _ in valid_pairs:
            ext = img_path.suffix.lower()
            format_counts[ext] = format_counts.get(ext, 0) + 1
        print("图片格式分布:")
        for ext, count in sorted(format_counts.items(), key=lambda x: -x[1]):
            print(f"  {ext}: {count}张")
        
        # 随机打乱
        random.seed(42)
        random.shuffle(valid_pairs)
        
        # 三分数据集
        total = len(valid_pairs)
        train_ratio = self.args.train_ratio
        val_ratio = self.args.val_ratio
        test_ratio = self.args.test_ratio
        
        # 验证比例之和
        ratio_sum = train_ratio + val_ratio + test_ratio
        if abs(ratio_sum - 1.0) > 0.01:
            print(f"警告: 数据集比例之和为 {ratio_sum:.2f}，将自动归一化")
            train_ratio = train_ratio / ratio_sum
            val_ratio = val_ratio / ratio_sum
            test_ratio = test_ratio / ratio_sum
        
        n_train = max(1, int(total * train_ratio))
        n_val = max(1, int(total * val_ratio))
        n_test = total - n_train - n_val
        
        train_pairs = valid_pairs[:n_train]
        val_pairs = valid_pairs[n_train:n_train + n_val]
        test_pairs = valid_pairs[n_train + n_val:]
        
        print(f"\n数据集划分:")
        print(f"  训练集: {len(train_pairs)} 张 ({train_ratio*100:.0f}%)")
        print(f"  验证集: {len(val_pairs)} 张 ({val_ratio*100:.0f}%) - 用于早停")
        print(f"  测试集: {len(test_pairs)} 张 ({test_ratio*100:.0f}%) - 用于最终评估")
        
        # 处理数据
        self._process_split(train_pairs, 'train')
        self._process_split(val_pairs, 'val')
        self._process_split(test_pairs, 'test')
        
        # 创建 data.yaml
        yaml_path = self.base_dir / f'data_{self.run_name}.yaml'
        with open(yaml_path, 'w', encoding='utf-8') as f:
            f.write(f"path: {self.dataset_dir}\n")
            f.write("train: images/train\n")
            f.write("val: images/val\n")
            f.write("test: images/test\n")  # 新增测试集路径
            f.write("\n# Classes\n")
            f.write("names:\n")
            for label, idx in sorted(self.label_map.items(), key=lambda x: x[1]):
                f.write(f"  {idx}: {label}\n")
        
        print(f"数据配置文件: {yaml_path}")
        
        # 保存测试集信息供后续评估使用
        self.test_pairs = test_pairs
        
        # 处理正样本（未标注图片）
        if self.args.include_positive:
            positive_samples = self.collect_positive_samples()
            if positive_samples:
                # 按相同比例分配正样本到各个数据集
                random.shuffle(positive_samples)
                n_pos_train = max(1, int(len(positive_samples) * train_ratio))
                n_pos_val = max(1, int(len(positive_samples) * val_ratio))
                
                pos_train = positive_samples[:n_pos_train]
                pos_val = positive_samples[n_pos_train:n_pos_train + n_pos_val]
                pos_test = positive_samples[n_pos_train + n_pos_val:]
                
                print(f"\n正样本划分:")
                print(f"  训练集: {len(pos_train)} 张")
                print(f"  验证集: {len(pos_val)} 张")
                print(f"  测试集: {len(pos_test)} 张")
                
                # 处理正样本（创建空标签文件）
                self._process_positive_samples(pos_train, 'train')
                self._process_positive_samples(pos_val, 'val')
                self._process_positive_samples(pos_test, 'test')
        
        return yaml_path, valid_pairs
    
    def _process_split(self, pairs, split):
        """处理一个数据分割"""
        for ann_file, img_path, img_name, data in pairs:
            # 读取图片获取尺寸（支持中文路径）
            img = imread_unicode(img_path)
            if img is None:
                print(f"警告: 无法读取图片 {img_path}")
                continue
            height, width = img.shape[:2]
            
            # 生成标签文件
            label_name = Path(img_name).stem + '.txt'
            label_path = self.dataset_dir / 'labels' / split / label_name
            
            with open(label_path, 'w') as out_f:
                for ann in data.get('annotations', []):
                    if ann.get('type') == 'bbox':
                        points = ann['points']
                        label = ann.get('label', '')
                        
                        if len(points) == 4 and label in self.label_map:
                            x, y, w, h = points
                            
                            # 处理负值坐标
                            if x < 0:
                                w += x
                                x = 0
                            if y < 0:
                                h += y
                                y = 0
                            
                            # 归一化
                            x_center = (x + w / 2) / width
                            y_center = (y + h / 2) / height
                            w_norm = w / width
                            h_norm = h / height
                            
                            # 裁剪到有效范围
                            x_center = max(0, min(1, x_center))
                            y_center = max(0, min(1, y_center))
                            w_norm = max(0, min(1, w_norm))
                            h_norm = max(0, min(1, h_norm))
                            
                            class_id = self.label_map[label]
                            out_f.write(f"{class_id} {x_center:.6f} {y_center:.6f} {w_norm:.6f} {h_norm:.6f}\n")
            
            # 复制图片
            dst_img_path = self.dataset_dir / 'images' / split / img_name
            shutil.copy(img_path, dst_img_path)
    
    def _process_positive_samples(self, image_paths, split):
        """处理正样本（创建空标签文件）"""
        for img_path in image_paths:
            img_name = img_path.name
            
            # 复制图片
            dst_img_path = self.dataset_dir / 'images' / split / img_name
            shutil.copy(img_path, dst_img_path)
            
            # 创建空的标签文件（表示无缺陷）
            label_name = img_path.stem + '.txt'
            label_path = self.dataset_dir / 'labels' / split / label_name
            label_path.touch()  # 创建空文件
    
    def augment_data(self):
        """增强版数据增强 - 支持更多变换类型"""
        if not self.args.augment:
            print("\n跳过数据增强（未启用）")
            return
        
        print("\n" + "=" * 60)
        print("Step 2.5: 数据增强（增强版）")
        print("=" * 60)
        
        train_img_dir = self.dataset_dir / 'images' / 'train'
        train_label_dir = self.dataset_dir / 'labels' / 'train'
        
        # 获取所有支持格式的原始图片
        original_images = self._get_image_files(train_img_dir)
        print(f"原始训练图片: {len(original_images)} 张")
        
        augmented_count = 0
        
        for img_path in original_images:
            # 跳过已经是增强后的图片
            aug_suffixes = ['_flip_h', '_flip_v', '_rot90', '_rot180', '_rot270',
                           '_bright', '_contrast', '_hsv', '_blur', '_noise']
            if any(suffix in img_path.stem for suffix in aug_suffixes):
                continue
            
            img = imread_unicode(img_path)
            if img is None:
                continue
            
            label_path = train_label_dir / (img_path.stem + '.txt')
            if not label_path.exists():
                continue
            
            with open(label_path, 'r') as f:
                labels = f.readlines()
            
            # ============= 几何变换 =============
            
            # 增强1: 水平翻转
            flipped_h = cv2.flip(img, 1)
            flipped_h_labels = self._transform_labels(labels, 'flip_h')
            self._save_augmented(train_img_dir, train_label_dir, img_path,
                                flipped_h, flipped_h_labels, 'flip_h')
            augmented_count += 1
            
            # 增强2: 垂直翻转
            flipped_v = cv2.flip(img, 0)
            flipped_v_labels = self._transform_labels(labels, 'flip_v')
            self._save_augmented(train_img_dir, train_label_dir, img_path,
                                flipped_v, flipped_v_labels, 'flip_v')
            augmented_count += 1
            
            # 增强3: 旋转90°
            rotated_90 = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
            rotated_90_labels = self._transform_labels(labels, 'rotate_90')
            self._save_augmented(train_img_dir, train_label_dir, img_path,
                                rotated_90, rotated_90_labels, 'rot90')
            augmented_count += 1
            
            # 增强4: 旋转180°
            rotated_180 = cv2.rotate(img, cv2.ROTATE_180)
            rotated_180_labels = self._transform_labels(labels, 'rotate_180')
            self._save_augmented(train_img_dir, train_label_dir, img_path,
                                rotated_180, rotated_180_labels, 'rot180')
            augmented_count += 1
            
            # 增强5: 旋转270°
            rotated_270 = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
            rotated_270_labels = self._transform_labels(labels, 'rotate_270')
            self._save_augmented(train_img_dir, train_label_dir, img_path,
                                rotated_270, rotated_270_labels, 'rot270')
            augmented_count += 1
            
            # ============= 颜色变换 =============
            
            # 增强6: 随机亮度
            alpha = random.uniform(0.7, 1.3)
            beta = random.randint(-30, 30)
            bright = cv2.convertScaleAbs(img, alpha=alpha, beta=beta)
            self._save_augmented(train_img_dir, train_label_dir, img_path,
                                bright, labels, 'bright')
            augmented_count += 1
            
            # 增强7: 随机对比度
            alpha = random.uniform(0.8, 1.5)
            contrast = cv2.convertScaleAbs(img, alpha=alpha, beta=0)
            self._save_augmented(train_img_dir, train_label_dir, img_path,
                                contrast, labels, 'contrast')
            augmented_count += 1
            
            # 增强8: HSV变换
            hsv_img = self._hsv_transform(img)
            self._save_augmented(train_img_dir, train_label_dir, img_path,
                                hsv_img, labels, 'hsv')
            augmented_count += 1
            
            # 增强9: 高斯模糊
            ksize = random.choice([3, 5])
            blurred = cv2.GaussianBlur(img, (ksize, ksize), 0)
            self._save_augmented(train_img_dir, train_label_dir, img_path,
                                blurred, labels, 'blur')
            augmented_count += 1
            
            # 增强10: 随机噪声
            sigma = random.uniform(10, 30)
            noise = np.random.normal(0, sigma, img.shape).astype(np.float32)
            noisy = np.clip(img.astype(np.float32) + noise, 0, 255).astype(np.uint8)
            self._save_augmented(train_img_dir, train_label_dir, img_path,
                                noisy, labels, 'noise')
            augmented_count += 1
        
        final_images = self._get_image_files(train_img_dir)
        print(f"增强后训练图片: {len(final_images)} 张 (+{augmented_count})")
        print(f"数据扩增倍数: {len(final_images) / max(1, len(original_images)):.1f}x")
    
    def _get_image_files(self, directory):
        """获取目录下所有支持格式的图片文件"""
        image_files = []
        for ext in self.SUPPORTED_EXTENSIONS:
            image_files.extend(directory.glob(f'*{ext}'))
        return list(set(image_files))
    
    def _transform_labels(self, labels, transform_type):
        """根据变换类型转换标签坐标"""
        transformed = []
        for label in labels:
            parts = label.strip().split()
            if len(parts) != 5:
                continue
            cls, x, y, w, h = parts
            x, y, w, h = float(x), float(y), float(w), float(h)
            
            if transform_type == 'flip_h':
                x = 1 - x
            elif transform_type == 'flip_v':
                y = 1 - y
            elif transform_type == 'rotate_90':
                x, y = 1 - y, x
                w, h = h, w
            elif transform_type == 'rotate_180':
                x, y = 1 - x, 1 - y
            elif transform_type == 'rotate_270':
                x, y = y, 1 - x
                w, h = h, w
            
            transformed.append(f"{cls} {x:.6f} {y:.6f} {w:.6f} {h:.6f}\n")
        return transformed
    
    def _hsv_transform(self, img):
        """HSV颜色空间随机变换"""
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
        
        h_shift = random.uniform(-18, 18)
        hsv[:, :, 0] = (hsv[:, :, 0] + h_shift) % 180
        
        s_scale = random.uniform(0.7, 1.3)
        hsv[:, :, 1] = np.clip(hsv[:, :, 1] * s_scale, 0, 255)
        
        v_scale = random.uniform(0.8, 1.2)
        hsv[:, :, 2] = np.clip(hsv[:, :, 2] * v_scale, 0, 255)
        
        return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    
    def _save_augmented(self, img_dir, label_dir, orig_path, img, labels, suffix):
        """保存增强后的图片和标签"""
        aug_img_name = f"{orig_path.stem}_{suffix}{orig_path.suffix}"
        aug_label_name = f"{orig_path.stem}_{suffix}.txt"
        
        imwrite_unicode(img_dir / aug_img_name, img)
        with open(label_dir / aug_label_name, 'w') as f:
            if isinstance(labels, list):
                f.writelines(labels)
            else:
                f.write(labels)
    
    def train(self, yaml_path):
        """训练模型 - 优化版配置（含早停）"""
        print("\n" + "=" * 60)
        print(f"Step 3: 训练模型 ({self.args.epochs} epochs)")
        print("=" * 60)
        
        from ultralytics import YOLO
        
        model = YOLO(self.args.model)
        
        print(f"使用设备: {self.args.device}")
        print(f"优化器: AdamW")
        print(f"学习率: 0.001 → 0.00001 (余弦退火)")
        print(f"早停: 50轮无改进则停止（基于验证集）")
        
        results = model.train(
            # ========== 基础配置 ==========
            data=str(yaml_path),
            epochs=self.args.epochs,
            imgsz=self.args.imgsz,
            batch=self.args.batch,
            device=self.args.device,
            project=str(self.runs_dir),
            name=self.run_name,
            exist_ok=True,
            verbose=True,
            
            # ========== 优化器配置 ==========
            optimizer='AdamW',
            lr0=0.001,
            lrf=0.01,
            weight_decay=0.0005,
            
            # ========== 学习率调度 ==========
            cos_lr=True,
            warmup_epochs=5.0,
            warmup_momentum=0.8,
            warmup_bias_lr=0.1,
            
            # ========== 正则化 ==========
            dropout=0.1,
            label_smoothing=0.1,
            
            # ========== 早停机制（基于验证集） ==========
            patience=50,
            
            # ========== 在线数据增强配置 ==========
            hsv_h=0.015,
            hsv_s=0.7,
            hsv_v=0.4,
            degrees=15.0,
            translate=0.1,
            scale=0.3,
            shear=2.0,
            perspective=0.0005,
            flipud=0.5,
            fliplr=0.5,
            mosaic=1.0,
            mixup=0.15,
            copy_paste=0.1,
            erasing=0.4,
            
            # ========== 训练技巧 ==========
            close_mosaic=10,
        )
        
        best_model_path = self.runs_dir / self.run_name / 'weights' / 'best.pt'
        print(f"\n训练完成!")
        print(f"最佳模型: {best_model_path}")
        
        return best_model_path
    
    def predict_all(self, model_path, all_pairs):
        """对所有数据进行预测"""
        if self.args.no_predict:
            print("\n跳过预测（--no_predict）")
            return
        
        print("\n" + "=" * 60)
        print("Step 4: 对所有数据进行预测")
        print("=" * 60)
        
        from ultralytics import YOLO
        
        model = YOLO(str(model_path))
        
        # 收集所有图片路径
        image_paths = [str(pair[1]) for pair in all_pairs]
        
        print(f"对 {len(image_paths)} 张图片进行预测...")
        print(f"使用设备: {self.args.device}")
        
        predict_dir = self.runs_dir / f'predict_{self.run_name}'
        
        results = model.predict(
            source=image_paths,
            save=True,
            project=str(predict_dir),
            name='results',
            exist_ok=True,
            conf=self.args.conf,
            save_txt=True,
            device=self.args.device
        )
        
        # 统计结果
        print("\n预测结果统计:")
        total_detections = 0
        class_counts = {}
        
        for r in results:
            boxes = r.boxes
            total_detections += len(boxes)
            for box in boxes:
                cls_id = int(box.cls[0])
                cls_name = model.names[cls_id]
                class_counts[cls_name] = class_counts.get(cls_name, 0) + 1
        
        print(f"  总检测数: {total_detections}")
        for cls_name, count in sorted(class_counts.items()):
            print(f"  {cls_name}: {count}")
        
        print(f"\n预测结果保存至: {predict_dir / 'results'}")
        
        return results
    
    def evaluate_on_test(self, model_path):
        """在测试集上进行最终评估"""
        print("\n" + "=" * 60)
        print("Step 5: 测试集最终评估")
        print("=" * 60)
        
        from ultralytics import YOLO
        
        model = YOLO(str(model_path))
        
        test_img_dir = self.dataset_dir / 'images' / 'test'
        test_images = self._get_image_files(test_img_dir)
        
        if not test_images:
            print("警告: 测试集为空，跳过测试评估")
            return None
        
        print(f"测试集图片数: {len(test_images)}")
        
        # 使用YOLOv8内置验证
        yaml_path = self.base_dir / f'data_{self.run_name}.yaml'
        
        try:
            metrics = model.val(
                data=str(yaml_path),
                split='test',
                device=self.args.device,
                verbose=True
            )
            
            print("\n测试集评估结果:")
            print(f"  mAP@50: {metrics.box.map50:.4f}")
            print(f"  mAP@50-95: {metrics.box.map:.4f}")
            print(f"  Precision: {metrics.box.mp:.4f}")
            print(f"  Recall: {metrics.box.mr:.4f}")
            
            return metrics
        except Exception as e:
            print(f"测试集评估失败: {e}")
            return None
    
    def run(self):
        """运行完整流程"""
        print("=" * 60)
        print("漆面缺陷检测 - 统一训练流程（优化版）")
        print("=" * 60)
        print(f"\n配置:")
        print(f"  数据目录: {self.data_dir}")
        print(f"  模型大小: {self.args.model_size} ({self.args.model})")
        print(f"  训练轮数: {self.args.epochs}")
        print(f"  数据增强: {'启用' if self.args.augment else '禁用'}")
        print(f"  数据集划分: 训练{self.args.train_ratio*100:.0f}%/验证{self.args.val_ratio*100:.0f}%/测试{self.args.test_ratio*100:.0f}%")
        print(f"  图片尺寸: {self.args.imgsz}")
        print(f"  批次大小: {self.args.batch}")
        print(f"  运行名称: {self.run_name}")
        print(f"  训练设备: {self.args.device}")
        
        # 检查数据目录
        if not self.image_dir.exists():
            raise FileNotFoundError(f"图片目录不存在: {self.image_dir}")
        if not self.annotation_dir.exists():
            raise FileNotFoundError(f"标注目录不存在: {self.annotation_dir}")
        
        # Step 1: 收集类别
        self.collect_labels()
        
        # Step 2: 准备数据集
        yaml_path, all_pairs = self.prepare_dataset()
        
        # Step 2.5: 数据增强（可选）
        self.augment_data()
        
        # Step 3: 训练
        model_path = self.train(yaml_path)
        
        # Step 4: 预测
        self.predict_all(model_path, all_pairs)
        
        # Step 5: 测试集评估
        self.evaluate_on_test(model_path)
        
        print("\n" + "=" * 60)
        print("全部流程完成!")
        print("=" * 60)
        print(f"\n输出文件:")
        print(f"  模型权重: {self.runs_dir / self.run_name / 'weights'}")
        print(f"  训练结果: {self.runs_dir / self.run_name}")
        print(f"  数据配置: {self.base_dir / f'data_{self.run_name}.yaml'}")
        print(f"  数据集: {self.dataset_dir}")
        if not self.args.no_predict:
            print(f"  预测结果: {self.runs_dir / f'predict_{self.run_name}'}")


def main():
    args = parse_args()
    pipeline = DefectDetectionPipeline(args)
    pipeline.run()


if __name__ == '__main__':
    main()
