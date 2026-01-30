#!/usr/bin/env python3
"""
音频特征提取模块
从音频文件中提取用于异常检测的特征
"""

import librosa
import numpy as np
import scipy.stats
from pathlib import Path
from typing import Dict, Optional


def extract_features(audio_path: str) -> Optional[Dict]:
    """
    提取基础音频特征，用于异常检测

    Args:
        audio_path: 音频文件路径

    Returns:
        特征字典，如果提取失败则返回None
    """
    try:
        y, sr = librosa.load(audio_path, sr=None)
        features = {}

        # 时域特征
        rms = librosa.feature.rms(y=y)
        features['rms_mean'] = float(np.mean(rms))
        features['energy_std'] = float(np.std(rms))
        features['zcr_mean'] = float(np.mean(librosa.feature.zero_crossing_rate(y=y)))
        features['crest_factor'] = float(np.max(np.abs(y)) / (np.sqrt(np.mean(y**2)) + 1e-10))

        # 频域特征
        spec_cent = librosa.feature.spectral_centroid(y=y, sr=sr)
        features['spectral_centroid'] = float(np.mean(spec_cent))
        features['spectral_centroid_mean'] = float(np.mean(spec_cent))
        features['spectral_centroid_std'] = float(np.std(spec_cent))

        spec_bw = librosa.feature.spectral_bandwidth(y=y, sr=sr)
        features['spectral_bandwidth_mean'] = float(np.mean(spec_bw))

        spec_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
        features['spectral_rolloff_mean'] = float(np.mean(spec_rolloff))

        spec_contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
        features['spectral_contrast'] = float(np.mean(spec_contrast))

        # 低频能量比例 (0-500Hz)
        stft = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=sr)
        low_freq_mask = freqs < 500
        low_freq_energy = np.sum(stft[low_freq_mask, :])
        total_energy = np.sum(stft)
        features['low_freq_ratio'] = float(low_freq_energy / (total_energy + 1e-10))

        # MFCC
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        features['mfcc_2'] = float(np.mean(mfcc[1]))
        for i in range(13):
            features[f'mfcc_{i+1}_mean'] = float(np.mean(mfcc[i]))
            features[f'mfcc_{i+1}_std'] = float(np.std(mfcc[i]))

        # 统计特征
        features['skewness'] = float(scipy.stats.skew(y))
        features['kurtosis'] = float(scipy.stats.kurtosis(y))
        features['spectral_flatness_mean'] = float(np.mean(librosa.feature.spectral_flatness(y=y)))

        # Chroma 特征
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        features['chroma_mean'] = float(np.mean(chroma))

        features['filename'] = Path(audio_path).name
        features['sample_rate'] = int(sr)

        return features
    except Exception as e:
        print(f"Error extracting features from {audio_path}: {e}")
        return None


def extract_enhanced_features(audio_path: str) -> Optional[Dict]:
    """
    提取增强音频特征（包含更多特征）

    Args:
        audio_path: 音频文件路径

    Returns:
        增强特征字典，如果提取失败则返回None
    """
    try:
        # 首先提取基础特征
        features = extract_features(audio_path)
        if features is None:
            return None

        # 加载音频
        y, sr = librosa.load(audio_path, sr=None)

        # 添加更多高级特征
        # Spectral features
        spec_flatness = librosa.feature.spectral_flatness(y=y)
        features['spectral_flatness_std'] = float(np.std(spec_flatness))

        # Tonnetz features
        tonnetz = librosa.feature.tonnetz(y=y, sr=sr)
        for i in range(min(6, tonnetz.shape[0])):
            features[f'tonnetz_{i+1}_mean'] = float(np.mean(tonnetz[i]))
            features[f'tonnetz_{i+1}_std'] = float(np.std(tonnetz[i]))

        # Poly features
        try:
            poly_features = librosa.feature.poly_features(y=y, sr=sr, order=1)
            features['poly_0_mean'] = float(np.mean(poly_features[0]))
            features['poly_1_mean'] = float(np.mean(poly_features[1]))
        except:
            features['poly_0_mean'] = 0.0
            features['poly_1_mean'] = 0.0

        # Tempogram
        try:
            tempogram = librosa.feature.tempogram(y=y, sr=sr)
            features['tempogram_mean'] = float(np.mean(tempogram))
            features['tempogram_std'] = float(np.std(tempogram))
        except:
            features['tempogram_mean'] = 0.0
            features['tempogram_std'] = 0.0

        return features
    except Exception as e:
        print(f"Error extracting enhanced features from {audio_path}: {e}")
        return None


def get_audio_duration(audio_path: str) -> Optional[float]:
    """
    获取音频时长

    Args:
        audio_path: 音频文件路径

    Returns:
        音频时长（秒），如果失败则返回None
    """
    try:
        duration = librosa.get_duration(path=audio_path)
        return float(duration)
    except Exception as e:
        print(f"Error getting duration from {audio_path}: {e}")
        return None


def get_audio_sample_rate(audio_path: str) -> Optional[int]:
    """
    获取音频采样率

    Args:
        audio_path: 音频文件路径

    Returns:
        采样率，如果失败则返回None
    """
    try:
        _, sr = librosa.load(audio_path, sr=None, duration=0.1)
        return int(sr)
    except Exception as e:
        print(f"Error getting sample rate from {audio_path}: {e}")
        return None
