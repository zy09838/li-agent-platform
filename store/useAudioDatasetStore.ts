import { create } from 'zustand';
import {
  AudioDataset,
  AudioFile,
  AudioAnomalyType,
  AudioSeverity,
  ProjectType,
  DatasetType,
  TimeSegmentAnnotation
} from '../types/dataset';

const API_BASE = 'http://localhost:5002/api';

interface AudioDatasetStore {
  datasets: AudioDataset[];
  currentDataset: AudioDataset | null;
  isLoading: boolean;
  error: string | null;

  // 数据集操作
  fetchAudioDatasets: () => Promise<void>;
  createAudioDataset: (name: string, description: string) => Promise<AudioDataset | null>;
  getAudioDataset: (id: string) => Promise<AudioDataset | null>;
  deleteAudioDataset: (id: string) => Promise<void>;
  setCurrentDataset: (id: string) => void;

  // 音频文件操作
  uploadAudioFile: (datasetId: string, file: File) => Promise<AudioFile | null>;
  annotateAudio: (datasetId: string, audioId: string, annotation: {
    anomalyType: AudioAnomalyType;
    severity: AudioSeverity;
    notes?: string;
    segments?: TimeSegmentAnnotation[];  // 时间区间精细化标注
  }) => Promise<void>;
  deleteAudioFile: (datasetId: string, audioId: string) => Promise<void>;
}

export const useAudioDatasetStore = create<AudioDatasetStore>((set, get) => ({
  datasets: [],
  currentDataset: null,
  isLoading: false,
  error: null,

  fetchAudioDatasets: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/datasets`);
      const data = await response.json();

      if (data.success) {
        // 只保留音频数据集
        const audioDatasets = data.data.filter((ds: any) => ds.datasetType === 'audio');
        set({ datasets: audioDatasets, isLoading: false });
      } else {
        throw new Error(data.error || '获取数据集失败');
      }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      console.error('Failed to fetch audio datasets:', error);
    }
  },

  createAudioDataset: async (name: string, description: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/datasets/audio/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });

      const data = await response.json();

      if (data.success) {
        const newDataset: AudioDataset = {
          ...data.data,
          projectType: ProjectType.AUDIO_ANOMALY,
          datasetType: DatasetType.AUDIO,
          audioFiles: data.data.audioFiles || []
        };

        set(state => ({
          datasets: [newDataset, ...state.datasets],
          isLoading: false
        }));

        return newDataset;
      } else {
        throw new Error(data.error || '创建数据集失败');
      }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      console.error('Failed to create audio dataset:', error);
      return null;
    }
  },

  getAudioDataset: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/datasets/${id}`);
      const data = await response.json();

      if (data.success) {
        set({ currentDataset: data.data, isLoading: false });
        return data.data;
      } else {
        throw new Error(data.error || '获取数据集失败');
      }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      console.error('Failed to get audio dataset:', error);
      return null;
    }
  },

  deleteAudioDataset: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/datasets/${id}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        set(state => ({
          datasets: state.datasets.filter(ds => ds.id !== id),
          currentDataset: state.currentDataset?.id === id ? null : state.currentDataset,
          isLoading: false
        }));
      } else {
        throw new Error(data.error || '删除数据集失败');
      }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      console.error('Failed to delete audio dataset:', error);
    }
  },

  setCurrentDataset: (id: string) => {
    if (!id) {
      set({ currentDataset: null });
      return;
    }
    const dataset = get().datasets.find(ds => ds.id === id);
    if (dataset) {
      set({ currentDataset: dataset });
    }
  },

  uploadAudioFile: async (datasetId: string, file: File) => {
    set({ isLoading: true, error: null });
    try {
      const formData = new FormData();
      formData.append('audio', file);

      const response = await fetch(`${API_BASE}/datasets/${datasetId}/upload-audio`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        // 更新数据集中的音频列表
        set(state => {
          const updatedDatasets = state.datasets.map(ds => {
            if (ds.id === datasetId) {
              return {
                ...ds,
                audioFiles: [...ds.audioFiles, data.data]
              };
            }
            return ds;
          });

          const updatedCurrent = state.currentDataset?.id === datasetId
            ? {
                ...state.currentDataset,
                audioFiles: [...state.currentDataset.audioFiles, data.data]
              }
            : state.currentDataset;

          return {
            datasets: updatedDatasets,
            currentDataset: updatedCurrent as AudioDataset | null,
            isLoading: false
          };
        });

        return data.data;
      } else {
        throw new Error(data.error || '上传音频失败');
      }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      console.error('Failed to upload audio file:', error);
      return null;
    }
  },

  annotateAudio: async (datasetId: string, audioId: string, annotation) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/datasets/${datasetId}/annotate-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioId,
          anomalyType: annotation.anomalyType,
          severity: annotation.severity,
          notes: annotation.notes || '',
          segments: annotation.segments || []  // 传递时间区间标注
        })
      });

      const data = await response.json();

      if (data.success) {
        // 更新音频文件的标注信息
        set(state => {
          const updatedDatasets = state.datasets.map(ds => {
            if (ds.id === datasetId) {
              return {
                ...ds,
                audioFiles: ds.audioFiles.map(af =>
                  af.id === audioId ? data.data : af
                )
              };
            }
            return ds;
          });

          const updatedCurrent = state.currentDataset?.id === datasetId
            ? {
                ...state.currentDataset,
                audioFiles: state.currentDataset.audioFiles.map(af =>
                  af.id === audioId ? data.data : af
                )
              }
            : state.currentDataset;

          return {
            datasets: updatedDatasets,
            currentDataset: updatedCurrent as AudioDataset | null,
            isLoading: false
          };
        });
      } else {
        throw new Error(data.error || '标注失败');
      }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      console.error('Failed to annotate audio:', error);
      throw error;
    }
  },

  deleteAudioFile: async (datasetId: string, audioId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/datasets/${datasetId}/audios/${audioId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        set(state => {
          const updatedDatasets = state.datasets.map(ds => {
            if (ds.id === datasetId) {
              return {
                ...ds,
                audioFiles: ds.audioFiles.filter(af => af.id !== audioId)
              };
            }
            return ds;
          });

          const updatedCurrent = state.currentDataset?.id === datasetId
            ? {
                ...state.currentDataset,
                audioFiles: state.currentDataset.audioFiles.filter(af => af.id !== audioId)
              }
            : state.currentDataset;

          return {
            datasets: updatedDatasets,
            currentDataset: updatedCurrent as AudioDataset | null,
            isLoading: false
          };
        });
      } else {
        throw new Error(data.error || '删除音频失败');
      }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      console.error('Failed to delete audio file:', error);
    }
  }
}));
