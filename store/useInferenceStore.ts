import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 视觉检测结果接口
export interface VisionDetection {
    class: string;
    confidence: number;
    bbox: [number, number, number, number];
}

export interface VisionInspectionItem {
    id: string;
    line: string;
    time: string;
    imgUrl: string;
    status: 'PASS' | 'NG';
    issue?: string;
    confidence?: string;
    detections?: VisionDetection[];
    imageWidth?: number;
    imageHeight?: number;
}

// 听觉检测结果接口
export interface AudioDetectionResult {
    id: string;
    filename: string;
    is_abnormal: boolean;
    score: number;
    status: string;
    confidence: string;
    level?: string;
    time: string;
    fileUrl?: string;
}

interface InferenceState {
    visionHistory: Record<string, VisionInspectionItem[]>;
    audioHistory: AudioDetectionResult[];
    addVisionResult: (partType: string, result: VisionInspectionItem | VisionInspectionItem[]) => void;
    addAudioResult: (result: AudioDetectionResult | AudioDetectionResult[]) => void;
    clearVisionHistory: (partType?: string) => void;
    clearAudioHistory: () => void;
    clearHistory: () => void;
    updateAudioThreshold: (threshold: number) => void;
}

const MAX_HISTORY_PER_TYPE = 100; // 从20扩展到100

/**
 * 根据异常得分和阈值重新计算判定结果
 * @param score 异常得分 (0-1，越高越正常)
 * @param threshold 阈值百分比 (0-100，越高越敏感)
 * @returns 更新后的判定结果
 */
const recalculateAudioResult = (score: number, threshold: number): {
    is_abnormal: boolean;
    status: string;
    confidence: string;
    level: string;
} => {
    // 将阈值从0-100转换为0-1，并反转（因为score越高越正常）
    const normalityThreshold = 1 - (threshold / 100);

    // 判定是否异常：score < normalityThreshold 则为异常
    const is_abnormal = score < normalityThreshold;

    if (is_abnormal) {
        // 异常情况：根据score细分严重程度
        if (score < 0.3) {
            return {
                is_abnormal: true,
                level: 'CRITICAL',
                status: '严重异常',
                confidence: 'Very High'
            };
        } else if (score < 0.4) {
            return {
                is_abnormal: true,
                level: 'HIGH',
                status: '明显异常',
                confidence: 'High'
            };
        } else {
            return {
                is_abnormal: true,
                level: 'MEDIUM',
                status: '中度异常',
                confidence: 'Medium'
            };
        }
    } else {
        // 正常情况：根据score细分健康程度
        if (score > 0.7) {
            return {
                is_abnormal: false,
                level: 'PERFECT',
                status: '完全正常',
                confidence: 'Very High'
            };
        } else if (score > 0.5) {
            return {
                is_abnormal: false,
                level: 'NORMAL',
                status: '基本正常',
                confidence: 'High'
            };
        } else {
            return {
                is_abnormal: false,
                level: 'SUSPICIOUS',
                status: '可疑',
                confidence: 'Medium'
            };
        }
    }
};

export const useInferenceStore = create<InferenceState>()(
    persist(
        (set) => ({
            visionHistory: { paint: [], electric_drive: [], glass: [] },
            audioHistory: [],

            addVisionResult: (partType, result) => set((state) => {
                const current = state.visionHistory[partType] || [];
                const newItems = Array.isArray(result) ? result : [result];
                // 将新结果插入到开头，并限制数量
                const updated = [...newItems, ...current].slice(0, MAX_HISTORY_PER_TYPE);

                return {
                    visionHistory: {
                        ...state.visionHistory,
                        [partType]: updated
                    }
                };
            }),

            addAudioResult: (result) => set((state) => {
                const newItems = Array.isArray(result) ? result : [result];
                const updated = [...newItems, ...state.audioHistory].slice(0, MAX_HISTORY_PER_TYPE);

                return {
                    audioHistory: updated
                };
            }),

            // 清除视觉历史记录（可指定零件类型）
            clearVisionHistory: (partType) => set((state) => {
                if (partType) {
                    // 清除指定零件类型的历史
                    return {
                        visionHistory: {
                            ...state.visionHistory,
                            [partType]: []
                        }
                    };
                } else {
                    // 清除所有视觉历史
                    return {
                        visionHistory: { paint: [], electric_drive: [], glass: [] }
                    };
                }
            }),

            // 清除听觉历史记录
            clearAudioHistory: () => set({
                audioHistory: []
            }),

            // 清除所有历史记录
            clearHistory: () => set({
                visionHistory: { paint: [], electric_drive: [], glass: [] },
                audioHistory: []
            }),

            // 根据新阈值更新所有音频检测结果
            updateAudioThreshold: (threshold: number) => set((state) => {
                const updatedHistory = state.audioHistory.map(item => {
                    // 如果检测失败，不重新计算
                    if (item.status === '检测失败' || item.score === 0) {
                        return item;
                    }

                    // 重新计算判定结果
                    const newResult = recalculateAudioResult(item.score, threshold);

                    return {
                        ...item,
                        is_abnormal: newResult.is_abnormal,
                        status: newResult.status,
                        confidence: newResult.confidence,
                        level: newResult.level
                    };
                });

                return {
                    audioHistory: updatedHistory
                };
            })
        }),
        {
            name: 'inference-cache',
            // 可以在这里配置哪些字段不需要持久化，或者序列化逻辑
        }
    )
);
