#!/usr/bin/env python3
"""
音频异常检测模型训练器
使用集成学习方法训练异常检测模型
"""

import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from sklearn.svm import OneClassSVM
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import RobustScaler
from sklearn.metrics import classification_report, accuracy_score, precision_score, recall_score, f1_score


class EnsembleDetector:
    """集成异常检测器"""

    def __init__(self, contamination: float = 0.45):
        """
        Args:
            contamination: 污染率，预期异常样本的比例
        """
        self.contamination = contamination
        self.models = {}
        self.weights = {}

    def fit(self, X: np.ndarray) -> 'EnsembleDetector':
        """
        训练集成模型

        Args:
            X: 训练数据（仅正常样本）

        Returns:
            self
        """
        self.models = {
            'ocsvm': OneClassSVM(kernel='rbf', gamma='auto', nu=self.contamination),
            'iforest': IsolationForest(contamination=self.contamination, random_state=42, n_estimators=200),
            'lof': LocalOutlierFactor(contamination=self.contamination, novelty=True, n_neighbors=3)
        }

        for name, model in self.models.items():
            model.fit(X)

        # 均等权重
        base_weight = 1.0 / len(self.models)
        self.weights = {name: base_weight for name in self.models.keys()}

        return self

    def predict(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray, Dict]:
        """
        预测样本是否异常

        Args:
            X: 待预测数据

        Returns:
            (predictions, scores, individual_scores)
            - predictions: 预测结果 (1=正常, -1=异常)
            - scores: 综合异常得分 (0-1, 越高越正常)
            - individual_scores: 各模型的原始得分
        """
        scores = {}
        predictions = {}
        for name, model in self.models.items():
            scores[name] = model.decision_function(X)
            # 使用各模型自己的predict方法进行判定
            predictions[name] = model.predict(X)

        # 综合预测：多数投票
        n_samples = len(X)
        vote_counts = np.zeros(n_samples)
        for name, pred in predictions.items():
            vote_counts += (pred == -1).astype(int) * self.weights[name]
        
        # 如果超过一半的加权投票认为是异常，则判定为异常
        final_pred = np.where(vote_counts >= 0.5, -1, 1)
        
        # 计算综合得分 (使用 sigmoid 归一化到 0-1)
        raw_scores = np.zeros(n_samples)
        for name, score in scores.items():
            raw_scores += self.weights[name] * score
        
        # 使用 sigmoid 函数将得分映射到 0-1，得分越高越正常
        weighted_scores = 1.0 / (1.0 + np.exp(-raw_scores))

        return final_pred, weighted_scores, scores


def train_model(
    data_path: str,
    output_model: str = 'optimized_anomaly_model.pkl',
    contamination: float = 0.45,
    feature_selection: str = 'all',
    top_features: Optional[int] = None
) -> Dict:
    """
    训练音频异常检测模型

    Args:
        data_path: 特征CSV文件路径
        output_model: 输出模型文件路径
        contamination: 污染率
        feature_selection: 特征选择方法 ('all', 'variance', 'correlation')
        top_features: 选择的特征数量（如果为None则使用所有特征）

    Returns:
        模型数据字典
    """
    print(f"Loading data from {data_path}...")
    df = pd.read_csv(data_path)

    # 排除非特征列
    exclude = ['filename', 'is_abnormal', 'sample_rate']
    features_list = [c for c in df.columns if c not in exclude]

    # 特征选择
    if top_features is not None and top_features < len(features_list):
        if feature_selection == 'variance':
            # 基于方差选择特征
            X_all = df[features_list].fillna(0).values
            variances = np.var(X_all, axis=0)
            top_indices = np.argsort(variances)[-top_features:]
            features_list = [features_list[i] for i in top_indices]
            print(f"Selected top {top_features} features by variance")
        elif feature_selection == 'correlation':
            # 基于与标签的相关性选择特征
            correlations = []
            y = df['is_abnormal'].astype(int)
            for feat in features_list:
                corr = abs(df[feat].fillna(0).corr(y))
                correlations.append(corr)
            top_indices = np.argsort(correlations)[-top_features:]
            features_list = [features_list[i] for i in top_indices]
            print(f"Selected top {top_features} features by correlation")

    X = df[features_list].fillna(0).values
    y = df['is_abnormal']

    # 数据标准化
    scaler = RobustScaler()
    X_scaled = scaler.fit_transform(X)

    # 只用正常样本训练
    X_train = X_scaled[df['is_abnormal'] == False]

    print(f"Training ensemble model with {len(X_train)} normal samples...")
    print(f"Using {len(features_list)} features")

    ensemble = EnsembleDetector(contamination=contamination)
    ensemble.fit(X_train)

    # 保存模型
    model_data = {
        'ensemble': ensemble,
        'scaler': scaler,
        'features': features_list,
        'contamination': contamination
    }
    joblib.dump(model_data, output_model)
    print(f"Model saved to {output_model}")

    # 评估
    y_pred_raw, scores, _ = ensemble.predict(X_scaled)
    y_pred = (y_pred_raw == -1)

    print("\nTraining Results Summary:")
    print(classification_report(y, y_pred, target_names=['Normal', 'Abnormal']))

    # 计算指标
    metrics = {
        'accuracy': float(accuracy_score(y, y_pred)),
        'precision': float(precision_score(y, y_pred, zero_division=0)),
        'recall': float(recall_score(y, y_pred, zero_division=0)),
        'f1': float(f1_score(y, y_pred, zero_division=0))
    }

    print(f"\nMetrics:")
    print(f"  Accuracy:  {metrics['accuracy']:.4f}")
    print(f"  Precision: {metrics['precision']:.4f}")
    print(f"  Recall:    {metrics['recall']:.4f}")
    print(f"  F1 Score:  {metrics['f1']:.4f}")

    model_data['metrics'] = metrics

    return model_data


def train_from_audio_files(
    audio_files: List[str],
    labels: List[bool],
    output_model: str = 'audio_model.pkl',
    contamination: float = 0.45,
    use_enhanced: bool = True
) -> Dict:
    """
    直接从音频文件训练模型

    Args:
        audio_files: 音频文件路径列表
        labels: 标签列表 (True=异常, False=正常)
        output_model: 输出模型路径
        contamination: 污染率
        use_enhanced: 是否使用增强特征

    Returns:
        模型数据字典
    """
    from .feature_extraction import extract_features, extract_enhanced_features
    import tempfile

    print(f"Extracting features from {len(audio_files)} audio files...")

    extract_fn = extract_enhanced_features if use_enhanced else extract_features

    # 提取特征
    features_list = []
    for audio_file, is_abnormal in zip(audio_files, labels):
        feat = extract_fn(audio_file)
        if feat:
            feat['is_abnormal'] = is_abnormal
            features_list.append(feat)

    # 保存到临时CSV
    df = pd.DataFrame(features_list)
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        temp_csv = f.name
        df.to_csv(temp_csv, index=False)

    # 训练模型
    try:
        model_data = train_model(
            data_path=temp_csv,
            output_model=output_model,
            contamination=contamination
        )
        return model_data
    finally:
        # 清理临时文件
        Path(temp_csv).unlink(missing_ok=True)
