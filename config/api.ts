/**
 * API配置管理
 * 集中管理所有API端点配置
 * 
 * 部署架构：
 * - 训练服务：部署到 Railway（支持长时间任务）
 * - 数据集/检测/LLM服务：部署到 Vercel Serverless Functions
 */

// 判断是否为生产环境
const isProd = import.meta.env.PROD;

// API基础URL配置
export const API_CONFIG = {
  // 训练服务API - 部署到 Railway（外部服务）
  // 生产环境必须通过环境变量 VITE_TRAINING_API 配置 Railway 地址
  TRAINING_API: import.meta.env.VITE_TRAINING_API || (isProd ? '' : 'http://localhost:5001'),

  // 数据集服务API - 部署到 Vercel Serverless
  // 生产环境使用相对路径，开发环境使用本地服务
  DATASET_API: import.meta.env.VITE_DATASET_API || (isProd ? '/api' : 'http://localhost:5002'),

  // 检测服务API（YOLO服务）- 部署到 Vercel Serverless
  DETECTION_API: import.meta.env.VITE_DETECTION_API || (isProd ? '/api' : 'http://localhost:5000'),

  // LLM分析服务API - 部署到 Vercel Serverless
  LLM_API: import.meta.env.VITE_LLM_API || (isProd ? '/api' : 'http://localhost:5004'),

  // 音频检测服务API - 部署到 Vercel Serverless
  AUDIO_API: import.meta.env.VITE_AUDIO_API || (isProd ? '/api' : 'http://localhost:5003'),
};

// API端点
export const API_ENDPOINTS = {
  // 训练相关
  TRAINING: {
    START: `${API_CONFIG.TRAINING_API}/train/start`,
    START_FROM_DATASET: `${API_CONFIG.TRAINING_API}/train/start-from-dataset`,
    STATUS: `${API_CONFIG.TRAINING_API}/train/status`,
    LOGS: `${API_CONFIG.TRAINING_API}/train/logs`,
    STOP: `${API_CONFIG.TRAINING_API}/train/stop`,
    // 队列管理
    QUEUE_ADD: `${API_CONFIG.TRAINING_API}/train/queue/add`,
    QUEUE_STATUS: `${API_CONFIG.TRAINING_API}/train/queue/status`,
    QUEUE_CANCEL: `${API_CONFIG.TRAINING_API}/train/queue/cancel`,
  },

  // 模型管理
  MODELS: {
    LIST: `${API_CONFIG.TRAINING_API}/models`,
    GET: (id: string) => `${API_CONFIG.TRAINING_API}/models/${id}`,
    DELETE: (id: string) => `${API_CONFIG.TRAINING_API}/models/${id}`,
    DEPLOY: (id: string) => `${API_CONFIG.TRAINING_API}/models/${id}/deploy`,
    DOWNLOAD: (id: string) => `${API_CONFIG.TRAINING_API}/models/${id}/download`,
    METRICS: (id: string) => `${API_CONFIG.TRAINING_API}/evaluate/metrics/${id}`,
    // 版本管理
    TAG: (id: string) => `${API_CONFIG.TRAINING_API}/models/${id}/tag`,
    COMPARE: (id1: string, id2: string) => `${API_CONFIG.TRAINING_API}/models/${id1}/compare/${id2}`,
  },

  // 数据集管理
  DATASETS: {
    LIST: `${API_CONFIG.DATASET_API}/datasets`,
    CREATE: `${API_CONFIG.DATASET_API}/datasets`,
    GET: (id: string) => `${API_CONFIG.DATASET_API}/datasets/${id}`,
    UPDATE: (id: string) => `${API_CONFIG.DATASET_API}/datasets/${id}`,
    DELETE: (id: string) => `${API_CONFIG.DATASET_API}/datasets/${id}`,
    IMPORT_DEFAULT: `${API_CONFIG.DATASET_API}/datasets/import-default`,

    // 图片相关
    ADD_IMAGES: (id: string) => `${API_CONFIG.DATASET_API}/datasets/${id}/images`,
    DELETE_IMAGE: (datasetId: string, imageId: string) =>
      `${API_CONFIG.DATASET_API}/datasets/${datasetId}/images/${imageId}`,
    GET_IMAGE: (datasetId: string, imageId: string) =>
      `${API_CONFIG.DATASET_API}/datasets/${datasetId}/images/${imageId}/file`,

    // 标注相关
    GET_ANNOTATIONS: (datasetId: string, imageId: string) =>
      `${API_CONFIG.DATASET_API}/datasets/${datasetId}/images/${imageId}/annotations`,
    SAVE_ANNOTATIONS: (datasetId: string, imageId: string) =>
      `${API_CONFIG.DATASET_API}/datasets/${datasetId}/images/${imageId}/annotations`,

    // 导入导出
    EXPORT: (id: string) => `${API_CONFIG.TRAINING_API}/datasets/${id}/export`,
    IMPORT: `${API_CONFIG.TRAINING_API}/datasets/import`,
  },

  // 存储管理
  STORAGE: {
    INFO: `${API_CONFIG.TRAINING_API}/storage/info`,
    CLEANUP: `${API_CONFIG.TRAINING_API}/storage/cleanup`,
  },

  // 模型对比
  COMPARISON: {
    START: `${API_CONFIG.TRAINING_API}/comparison/start`,
    STATUS: (taskId: string) => `${API_CONFIG.TRAINING_API}/comparison/status/${taskId}`,
    REPORTS: `${API_CONFIG.TRAINING_API}/comparison/reports`,
    PRESETS: `${API_CONFIG.TRAINING_API}/comparison/presets`,
  },
};

// 导出便捷函数
export const getApiUrl = (service: keyof typeof API_CONFIG) => {
  return API_CONFIG[service];
};

export default API_ENDPOINTS;
