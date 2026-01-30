import { create } from 'zustand';

// ============== 类型定义 ==============
export interface TrainingConfig {
  data_dir: string;
  model_size: 'nano' | 'small' | 'medium' | 'v8nano' | 'v8medium';
  epochs: number;
  batch: number;
  imgsz: number;
  augment: boolean;
  train_ratio: number;
  conf: number;
  project_name: string;
  include_positive: boolean;  // 是否包含正样本训练
}

export interface TrainingMetrics {
  mAP50?: number;
  'mAP50-95'?: number;
  precision?: number;
  recall?: number;
  loss?: number;
  accuracy?: number;  // 音频模型用
  f1?: number;        // 音频模型用
}

export interface LogEntry {
  timestamp: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

export interface TrainingStatus {
  is_training: boolean;
  task_id: string | null;
  status: 'idle' | 'preparing' | 'training' | 'completed' | 'failed' | 'stopped';
  progress: number;
  current_epoch: number;
  total_epochs: number;
  metrics: TrainingMetrics;
  start_time: string | null;
  config: Partial<TrainingConfig>;
  training_type?: 'visual' | 'audio' | null;  // 新增：训练类型标识
}

export interface ModelInfo {
  id: string;
  name: string;
  run_name?: string;
  model_path: string;
  model_size?: 'nano' | 'small' | 'medium' | 'v8nano' | 'v8medium';
  epochs?: number;
  dataset?: string;
  dataset_id?: string;  // 音频模型用
  classes?: string[];
  num_classes?: number;
  created_at: string;
  metrics: TrainingMetrics;
  augment?: boolean;
  imgsz?: number;
  status?: 'completed' | 'training' | 'failed';
  file_exists?: boolean;
  file_size?: number;
  deployed?: boolean;
  deployed_part_type?: string;  // 部署到的零件类型: paint, electric_drive, glass
  deployed_at?: string;
  type?: string;  // 'audio_anomaly' for audio models
}

export interface DatasetInfo {
  name: string;
  path: string;
  image_count: number;
  annotation_count: number;
}

export interface TrainingHistory {
  epoch: number[];
  train_loss: number[];
  val_loss: number[];
  mAP50: number[];
  'mAP50-95': number[];
}

// ============== Store ==============
interface TrainingStore {
  // 状态
  trainingStatus: TrainingStatus;
  logs: LogEntry[];
  models: ModelInfo[];           // 视觉模型
  audioModels: ModelInfo[];      // 音频模型
  datasets: DatasetInfo[];
  selectedModelId: string | null;

  // API基础URL
  apiBaseUrl: string;

  // Actions
  setApiBaseUrl: (url: string) => void;

  // 训练相关
  startTraining: (config: TrainingConfig) => Promise<void>;
  stopTraining: () => Promise<void>;
  fetchTrainingStatus: () => Promise<void>;
  fetchLogs: () => Promise<void>;
  clearLogs: () => void;

  // 模型管理
  fetchModels: () => Promise<void>;
  fetchAudioModels: () => Promise<void>;  // 新增：获取音频模型
  deleteModel: (modelId: string) => Promise<void>;
  selectModel: (modelId: string | null) => void;
  fetchModelMetrics: (modelId: string) => Promise<{ metrics: TrainingMetrics; history: TrainingHistory | null }>;

  // 数据集
  fetchDatasets: () => Promise<void>;

  // 模型测试
  testModel: (modelId: string, imageBase64: string, confidence?: number) => Promise<any>;

  // 模型部署
  deployModel: (modelId: string, isAudio?: boolean, partType?: string) => Promise<void>;
}

export const useTrainingStore = create<TrainingStore>((set, get) => ({
  // 初始状态
  trainingStatus: {
    is_training: false,
    task_id: null,
    status: 'idle',
    progress: 0,
    current_epoch: 0,
    total_epochs: 0,
    metrics: {},
    start_time: null,
    config: {}
  },
  logs: [],
  models: [],
  audioModels: [],  // 音频模型列表
  datasets: [],
  selectedModelId: null,
  apiBaseUrl: 'http://localhost:5001',

  setApiBaseUrl: (url) => set({ apiBaseUrl: url }),

  // ============== 训练相关 ==============
  startTraining: async (config) => {
    const { apiBaseUrl } = get();
    try {
      const response = await fetch(`${apiBaseUrl}/train/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '启动训练失败');
      }

      const data = await response.json();
      set(state => ({
        trainingStatus: {
          ...state.trainingStatus,
          is_training: true,
          task_id: data.task_id,
          status: 'preparing',
          config
        }
      }));
    } catch (error: any) {
      throw new Error(error.message || '启动训练失败');
    }
  },

  stopTraining: async () => {
    const { apiBaseUrl } = get();
    try {
      await fetch(`${apiBaseUrl}/train/stop`, { method: 'POST' });
      set(state => ({
        trainingStatus: {
          ...state.trainingStatus,
          is_training: false,
          status: 'stopped'
        }
      }));
    } catch (error) {
      console.error('停止训练失败:', error);
    }
  },

  fetchTrainingStatus: async () => {
    const { apiBaseUrl } = get();
    try {
      const response = await fetch(`${apiBaseUrl}/train/status`);
      if (response.ok) {
        const data = await response.json();

        // 添加调试日志
        if (data.training_type === 'audio') {
          console.log('[TrainingStore] Audio training status:', data);
        }

        set({ trainingStatus: data });
      }
    } catch (error) {
      console.error('获取训练状态失败:', error);
    }
  },

  fetchLogs: async () => {
    const { apiBaseUrl } = get();
    try {
      const response = await fetch(`${apiBaseUrl}/train/logs`);
      if (response.ok) {
        const data = await response.json();
        set({ logs: data.logs || [] });
      }
    } catch (error) {
      console.error('获取日志失败:', error);
    }
  },

  clearLogs: () => set({ logs: [] }),

  // ============== 模型管理 ==============
  fetchModels: async () => {
    const { apiBaseUrl } = get();
    try {
      const response = await fetch(`${apiBaseUrl}/models`);
      if (response.ok) {
        const data = await response.json();
        // 过滤掉音频模型，只保留视觉模型（YOLO目标检测）
        const visualModels = (data.models || []).filter(
          (m: any) => m.type !== 'audio_anomaly'
        );
        set({ models: visualModels });
      }
    } catch (error) {
      console.error('获取视觉模型列表失败:', error);
    }
  },

  fetchAudioModels: async () => {
    const { apiBaseUrl } = get();
    try {
      const response = await fetch(`${apiBaseUrl}/api/audio/models`);
      if (response.ok) {
        const data = await response.json();
        const audioModels = data.data?.models || [];
        set({ audioModels });
      }
    } catch (error) {
      console.error('获取音频模型列表失败:', error);
    }
  },

  deleteModel: async (modelId) => {
    const { apiBaseUrl } = get();
    try {
      const response = await fetch(`${apiBaseUrl}/models/${modelId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        set(state => ({
          models: state.models.filter(m => m.id !== modelId),
          selectedModelId: state.selectedModelId === modelId ? null : state.selectedModelId
        }));
      }
    } catch (error) {
      console.error('删除模型失败:', error);
    }
  },

  selectModel: (modelId) => set({ selectedModelId: modelId }),

  fetchModelMetrics: async (modelId) => {
    const { apiBaseUrl } = get();
    try {
      const response = await fetch(`${apiBaseUrl}/evaluate/metrics/${modelId}`);
      if (response.ok) {
        return await response.json();
      }
      return { metrics: {}, history: null };
    } catch (error) {
      console.error('获取模型指标失败:', error);
      return { metrics: {}, history: null };
    }
  },

  // ============== 数据集 ==============
  fetchDatasets: async () => {
    const { apiBaseUrl } = get();
    try {
      console.log('[TrainingStore] Fetching datasets from:', `${apiBaseUrl}/datasets`);
      const response = await fetch(`${apiBaseUrl}/datasets`);
      if (response.ok) {
        const data = await response.json();
        console.log('[TrainingStore] Datasets received:', data);
        const datasets = data.datasets || [];
        set({ datasets });
        console.log('[TrainingStore] Datasets state updated:', datasets.length, 'items');
      } else {
        console.error('[TrainingStore] Datasets fetch failed:', response.status);
      }
    } catch (error) {
      console.error('[TrainingStore] 获取数据集列表失败:', error);
    }
  },

  // ============== 模型测试 ==============
  testModel: async (modelId, imageBase64, confidence = 0.25) => {
    const { apiBaseUrl } = get();
    try {
      const response = await fetch(`${apiBaseUrl}/evaluate/single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: modelId,
          image: imageBase64,
          confidence
        })
      });

      if (response.ok) {
        return await response.json();
      }

      const error = await response.json();
      throw new Error(error.error || '测试失败');
    } catch (error: any) {
      throw new Error(error.message || '测试失败');
    }
  },

  // ============== 模型部署 ==============  // 模型部署
  deployModel: async (modelId, isAudio = false, partType = 'paint') => {
    const { apiBaseUrl } = get();
    try {
      // 根据模型类型选择不同的部署端点
      const url = isAudio
        ? `${apiBaseUrl}/api/audio/models/${modelId}/deploy`
        : `${apiBaseUrl}/models/${modelId}/deploy`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ part_type: partType })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '部署失败');
      }
    } catch (error: any) {
      throw new Error(error.message || '部署失败');
    }
  }
}));

