#!/usr/bin/env python3
import os
import sys
import argparse
import joblib
import librosa
import numpy as np
import pandas as pd
import scipy.stats
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from datetime import datetime
from tqdm import tqdm
from sklearn.svm import OneClassSVM
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import RobustScaler
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix, precision_score, recall_score, f1_score

# --- Feature Extraction Section ---

def extract_features(audio_path):
    """提取音频特征，用于异常检测。"""
    try:
        y, sr = librosa.load(audio_path, sr=None)
        features = {}
        
        # 时域特征
        rms = librosa.feature.rms(y=y)
        features['rms_mean'] = np.mean(rms)
        features['energy_std'] = np.std(rms)
        features['zcr_mean'] = np.mean(librosa.feature.zero_crossing_rate(y=y))
        features['crest_factor'] = np.max(np.abs(y)) / (np.sqrt(np.mean(y**2)) + 1e-10)
        
        # 频域特征
        spec_cent = librosa.feature.spectral_centroid(y=y, sr=sr)
        features['spectral_centroid'] = np.mean(spec_cent)
        features['spectral_centroid_mean'] = np.mean(spec_cent)
        features['spectral_centroid_std'] = np.std(spec_cent)
        
        spec_bw = librosa.feature.spectral_bandwidth(y=y, sr=sr)
        features['spectral_bandwidth_mean'] = np.mean(spec_bw)
        
        spec_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
        features['spectral_rolloff_mean'] = np.mean(spec_rolloff)
        
        spec_contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
        features['spectral_contrast'] = np.mean(spec_contrast)
        
        # 低频能量比例 (0-500Hz)
        stft = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=sr)
        low_freq_mask = freqs < 500
        low_freq_energy = np.sum(stft[low_freq_mask, :])
        total_energy = np.sum(stft)
        features['low_freq_ratio'] = low_freq_energy / (total_energy + 1e-10)

        # MFCC
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        features['mfcc_2'] = np.mean(mfcc[1])
        for i in range(13):
            features[f'mfcc_{i+1}_mean'] = np.mean(mfcc[i])
            features[f'mfcc_{i+1}_std'] = np.std(mfcc[i])
            
        # 统计特征
        features['skewness'] = scipy.stats.skew(y)
        features['kurtosis'] = scipy.stats.kurtosis(y)
        features['spectral_flatness_mean'] = np.mean(librosa.feature.spectral_flatness(y=y))
        
        # Chroma 特征
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        features['chroma_mean'] = np.mean(chroma)
        
        features['filename'] = Path(audio_path).name
        features['sample_rate'] = sr
        return features
    except Exception as e:
        print(f"Error extracting features from {audio_path}: {e}")
        return None

# --- Model Training Section ---

class EnsembleDetector:
    def __init__(self, contamination=0.45):
        self.contamination = contamination
        self.models = {}
        self.weights = {}
        
    def fit(self, X):
        self.models = {
            'ocsvm': OneClassSVM(kernel='rbf', gamma='auto', nu=self.contamination),
            'iforest': IsolationForest(contamination=self.contamination, random_state=42, n_estimators=200),
            'lof': LocalOutlierFactor(contamination=self.contamination, novelty=True, n_neighbors=3)
        }
        for name, model in self.models.items():
            model.fit(X)
        base_weight = 1.0 / len(self.models)
        self.weights = {name: base_weight for name in self.models.keys()}
        return self

    def predict(self, X):
        scores = {}
        for name, model in self.models.items():
            scores[name] = model.decision_function(X)
        
        weighted_scores = np.zeros(len(X))
        for name, score in scores.items():
            s_min, s_max = score.min(), score.max()
            score_norm = (score - s_min) / (s_max - s_min + 1e-10)
            weighted_scores += self.weights[name] * score_norm
            
        threshold = np.percentile(weighted_scores, self.contamination * 100)
        final_pred = np.where(weighted_scores < threshold, -1, 1)
        return final_pred, weighted_scores, scores

def train_model(data_path, output_model='optimized_anomaly_model.pkl'):
    print(f"Loading data from {data_path}...")
    df = pd.read_csv(data_path)
    exclude = ['filename', 'is_abnormal', 'sample_rate']
    features_list = [c for c in df.columns if c not in exclude]
    
    X = df[features_list].fillna(0).values
    y = df['is_abnormal']
    
    scaler = RobustScaler()
    X_scaled = scaler.fit_transform(X)
    
    # Only train on normal samples
    X_train = X_scaled[df['is_abnormal'] == False]
    
    print("Training ensemble model...")
    ensemble = EnsembleDetector(contamination=0.45)
    ensemble.fit(X_train)
    
    # Save model
    model_data = {
        'ensemble': ensemble,
        'scaler': scaler,
        'features': features_list
    }
    joblib.dump(model_data, output_model)
    print(f"Model saved to {output_model}")
    
    # Evaluation
    y_pred_raw, scores, _ = ensemble.predict(X_scaled)
    y_pred = (y_pred_raw == -1)
    print("\nTraining Results Summary:")
    print(classification_report(y, y_pred, target_names=['Normal', 'Abnormal']))
    return model_data

# --- Inference Section ---

class AuscultationSystem:
    def __init__(self, model_path):
        data = joblib.load(model_path)
        self.ensemble = data['ensemble']
        self.scaler = data['scaler']
        self.features = data['features']
        
    def detect(self, audio_path):
        feat = extract_features(audio_path)
        if not feat: return None
        
        df = pd.DataFrame([feat])
        X = self.scaler.transform(df[self.features].fillna(0).values)
        y_pred, score, _ = self.ensemble.predict(X)
        
        is_abnormal = y_pred[0] == -1
        score_val = score[0]
        
        levels = [
            (0.1, 'CRITICAL', '严重异常'), (0.2, 'HIGH', '明显异常'), 
            (0.4, 'MEDIUM', '中度异常'), (0.6, 'SUSPICIOUS', '可疑'),
            (0.8, 'NORMAL', '基本正常'), (1.1, 'PERFECT', '完全正常')
        ]
        status = next(s for t, l, s in levels if score_val < t)
        
        return {
            'filename': Path(audio_path).name,
            'is_abnormal': is_abnormal,
            'score': float(score_val),
            'status': status
        }

# --- CLI Section ---

def main():
    parser = argparse.ArgumentParser(description="Industrial Auscultation Unified Tool")
    subparsers = parser.add_subparsers(dest="command")
    
    # Train command
    train_parser = subparsers.add_parser("train", help="Process audio and train model")
    train_parser.add_argument("--data", default="enhanced_audio_features.csv", help="Feature CSV path")
    
    # Detect command
    detect_parser = subparsers.add_parser("detect", help="Detect anomalies in audio")
    detect_parser.add_argument("input", help="Audio file or folder")
    detect_parser.add_argument("--model", default="optimized_anomaly_model.pkl", help="Model path")
    
    args = parser.parse_args()
    
    if args.command == "train":
        # First, ensure features are extracted if CSV doesn't exist
        if not os.path.exists(args.data):
            print(f"{args.data} not found. Extracting features from all .wav files...")
            wavs = glob.glob('*.wav')
            feats = []
            for w in tqdm(wavs):
                f = extract_features(w)
                if f:
                    f['is_abnormal'] = not Path(w).name.startswith('172.16.174.252_01_')
                    feats.append(f)
            pd.DataFrame(feats).to_csv(args.data, index=False, encoding='utf-8-sig')
            
        train_model(args.data)
        
    elif args.command == "detect":
        system = AuscultationSystem(args.model)
        input_path = Path(args.input)
        
        files = [input_path] if input_path.is_file() else list(input_path.glob('*.wav'))
        results = []
        for f in tqdm(files, desc="Detecting"):
            res = system.detect(f)
            if res: results.append(res)
        
        res_df = pd.DataFrame(results)
        print("\nDetection Results:")
        print(res_df[['filename', 'status', 'score']].to_string(index=False))
        
    else:
        parser.print_help()

if __name__ == "__main__":
    import glob
    main()
