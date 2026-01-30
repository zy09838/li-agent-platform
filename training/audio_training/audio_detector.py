#!/usr/bin/env python3
"""
音频异常检测系统
用于加载训练好的模型并进行检测
"""

import joblib
import pandas as pd
from pathlib import Path
from typing import Dict, Optional
from .feature_extraction import extract_features, extract_enhanced_features


class AuscultationSystem:
    """听诊系统 - 用于音频异常检测"""

    def __init__(self, model_path: str):
        """
        Args:
            model_path: 模型文件路径
        """
        data = joblib.load(model_path)
        self.ensemble = data['ensemble']
        self.scaler = data['scaler']
        self.features = data['features']
        self.contamination = data.get('contamination', 0.45)
        self.model_path = model_path
        # 检测是否使用增强特征（通过检查特征列表中是否包含增强特征特有的键）
        enhanced_markers = ['tonnetz_1_mean', 'spectral_flatness_std', 'poly_0_mean', 'tempogram_mean']
        self.use_enhanced = any(marker in self.features for marker in enhanced_markers)

    def detect(self, audio_path: str) -> Optional[Dict]:
        """
        检测单个音频文件

        Args:
            audio_path: 音频文件路径

        Returns:
            检测结果字典，包含:
            - filename: 文件名
            - is_abnormal: 是否异常
            - score: 异常得分 (0-1)
            - status: 状态描述
            - confidence: 置信度
        """
        # 根据模型配置选择特征提取函数
        if self.use_enhanced:
            feat = extract_enhanced_features(audio_path)
        else:
            feat = extract_features(audio_path)
        if not feat:
            return None

        # 准备数据
        df = pd.DataFrame([feat])
        X = self.scaler.transform(df[self.features].fillna(0).values)

        # 预测
        y_pred, score, _ = self.ensemble.predict(X)

        is_abnormal = y_pred[0] == -1
        score_val = float(score[0])

        # 状态判定（得分越高越正常，范围0-1）
        # 使用is_abnormal作为主要判定依据
        if is_abnormal:
            if score_val < 0.3:
                level, status, conf = 'CRITICAL', '严重异常', 'Very High'
            elif score_val < 0.4:
                level, status, conf = 'HIGH', '明显异常', 'High'
            else:
                level, status, conf = 'MEDIUM', '中度异常', 'Medium'
        else:
            if score_val > 0.7:
                level, status, conf = 'PERFECT', '完全正常', 'Very High'
            elif score_val > 0.5:
                level, status, conf = 'NORMAL', '基本正常', 'High'
            else:
                level, status, conf = 'SUSPICIOUS', '可疑', 'Medium'

        return {
            'filename': Path(audio_path).name,
            'is_abnormal': bool(is_abnormal),
            'score': score_val,
            'status': status,
            'confidence': conf,
            'level': level if 'level' in locals() else 'UNKNOWN'
        }

    def batch_detect(self, audio_paths: list) -> list:
        """
        批量检测音频文件

        Args:
            audio_paths: 音频文件路径列表

        Returns:
            检测结果列表
        """
        results = []
        for audio_path in audio_paths:
            result = self.detect(audio_path)
            if result:
                results.append(result)
        return results

    def get_model_info(self) -> Dict:
        """
        获取模型信息

        Returns:
            模型信息字典
        """
        return {
            'model_path': self.model_path,
            'features_count': len(self.features),
            'contamination': self.contamination,
            'models': list(self.ensemble.models.keys())
        }
