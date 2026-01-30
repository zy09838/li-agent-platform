import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Play, Database, Cpu, Layers, Settings2, Sparkles,
  ImageIcon, Hash, Percent, FolderOpen, AlertCircle, Check, Loader, Zap, CheckCircle2
} from 'lucide-react';
import { useTrainingStore, TrainingConfig as TrainingConfigType } from '../../store/useTrainingStore';
import AudioTrainingConfig from './AudioTrainingConfig';
import { ViewType } from '../../types';

interface TrainingConfigProps {
  onStartTraining: () => void;
  projectType?: string;
  onViewChange?: (view: ViewType) => void;  // 新增：用于导航
}

const TrainingConfig: React.FC<TrainingConfigProps> = ({
  onStartTraining,
  projectType = 'visual-defect',
  onViewChange
}) => {
  // 如果是音频项目，使用音频训练配置组件
  if (projectType === 'audio-anomaly') {
    return (
      <AudioTrainingConfig
        onStartTraining={onStartTraining}
        onNavigateToDatasets={() => onViewChange?.(ViewType.DATASET_HOME)}
      />
    );
  }

  // 原有的视觉缺陷训练配置
  const {
    datasets,
    trainingStatus,
    startTraining
  } = useTrainingStore();

  const [config, setConfig] = useState<TrainingConfigType>({
    data_dir: '',
    model_size: 'small',
    epochs: 100,
    batch: 12,
    imgsz: 640,
    augment: true,
    train_ratio: 0.8,
    conf: 0.25,
    project_name: '',
    include_positive: false  // 正样本训练
  });

  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // 调试日志
  useEffect(() => {
    console.log('[TrainingConfig] datasets state:', datasets);
  }, [datasets]);

  // 根据模型大小自动调整batch
  useEffect(() => {
    const batchMap: Record<string, number> = {
      'nano': 16,
      'small': 12,
      'medium': 8,
      'v8nano': 16,
      'v8medium': 8
    };
    setConfig(prev => ({
      ...prev,
      batch: batchMap[prev.model_size] || 16
    }));
  }, [config.model_size]);

  const handleStartTraining = async () => {
    if (!config.data_dir) {
      setError('请选择数据集');
      return;
    }

    setError(null);
    setIsStarting(true);

    try {
      await startTraining(config);
      onStartTraining();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsStarting(false);
    }
  };

  // 所有可用模型 - 包括 YOLO11 和 YOLOv8
  const modelOptions: Array<{
    id: TrainingConfigType['model_size'];
    name: string;
    subtitle: string;
    params: string;
    size: string;
    speed: string;
    accuracy: string;
    color: string;
    badge?: string;
    category: 'yolo11' | 'yolov8';
  }> = [
      // YOLO11 模型（推荐）
      {
        id: 'nano',
        name: 'YOLO11n',
        subtitle: 'Nano - 最新轻量',
        params: '2.6M',
        size: '5.4 MB',
        speed: '最快',
        accuracy: '★★★★☆',
        color: 'from-emerald-500 to-green-500',
        badge: 'NEW',
        category: 'yolo11'
      },
      {
        id: 'small',
        name: 'YOLO11s',
        subtitle: 'Small - 推荐',
        params: '9.4M',
        size: '19 MB',
        speed: '快速',
        accuracy: '★★★★☆',
        color: 'from-blue-500 to-cyan-500',
        badge: '推荐',
        category: 'yolo11'
      },
      {
        id: 'medium',
        name: 'YOLO11m',
        subtitle: 'Medium - 均衡',
        params: '20.1M',
        size: '39 MB',
        speed: '中等',
        accuracy: '★★★★★',
        color: 'from-violet-500 to-purple-500',
        badge: 'NEW',
        category: 'yolo11'
      },
      // YOLOv8 模型（兼容）
      {
        id: 'v8nano',
        name: 'YOLOv8n',
        subtitle: 'Nano - 兼容旧版',
        params: '3.2M',
        size: '6 MB',
        speed: '最快',
        accuracy: '★★★☆☆',
        color: 'from-gray-500 to-slate-500',
        category: 'yolov8'
      },
      {
        id: 'v8medium',
        name: 'YOLOv8m',
        subtitle: 'Medium - 兼容旧版',
        params: '25.9M',
        size: '50 MB',
        speed: '中等',
        accuracy: '★★★★☆',
        color: 'from-gray-500 to-slate-500',
        category: 'yolov8'
      }
    ];

  const yolo11Models = modelOptions.filter(m => m.category === 'yolo11');
  const yolov8Models = modelOptions.filter(m => m.category === 'yolov8');

  const selectedDataset = datasets.find(ds => ds.name === config.data_dir);

  return (
    <div className="space-y-6">
      {/* 第一步：数据集选择 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Database size={20} className="text-blue-500" />
          选择训练数据集
        </h3>

        {datasets.length === 0 ? (
          <div className="text-center py-8">
            <Database size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">暂无可用数据集</p>
            <p className="text-sm text-gray-400 mt-1">
              请先在 training/dataset_raw 目录下准备数据
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {datasets.map(ds => (
              <button
                key={ds.name}
                onClick={() => setConfig(prev => ({ ...prev, data_dir: ds.name }))}
                className={`p-4 rounded-lg border-2 text-left transition-all ${config.data_dir === ds.name
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
                  }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen size={18} className={config.data_dir === ds.name ? 'text-blue-500' : 'text-gray-400'} />
                    <span className="font-medium text-gray-900">{ds.name}</span>
                  </div>
                  {config.data_dir === ds.name && (
                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="mt-2 flex gap-4 text-sm text-gray-500">
                  <span>{ds.image_count} 张图片</span>
                  <span>{ds.annotation_count} 个标注</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 第二步：模型选择 - 选择数据集后显示 */}
      {config.data_dir && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Cpu size={20} className="text-violet-500" />
            选择模型架构
          </h3>

          {/* YOLO11 模型 */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-bold">YOLO11</span>
              最新一代 - 推荐使用
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {yolo11Models.map(model => (
                <button
                  key={model.id}
                  onClick={() => setConfig(prev => ({ ...prev, model_size: model.id }))}
                  className={`relative p-4 rounded-xl border-2 text-left transition-all ${config.model_size === model.id
                    ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  {model.badge && (
                    <div className={`absolute top-2 right-2 px-2 py-0.5 bg-gradient-to-r ${model.color} text-white text-xs font-bold rounded-full`}>
                      {model.badge}
                    </div>
                  )}
                  <div className={`text-lg font-bold bg-gradient-to-r ${model.color} bg-clip-text text-transparent`}>
                    {model.name}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{model.subtitle}</p>
                  <div className="mt-3 grid grid-cols-2 gap-1 text-xs text-gray-600">
                    <span>参数: {model.params}</span>
                    <span>速度: {model.speed}</span>
                    <span>大小: {model.size}</span>
                    <span className="text-amber-500">精度: {model.accuracy}</span>
                  </div>
                  {config.model_size === model.id && (
                    <div className="absolute bottom-2 right-2">
                      <Check size={18} className="text-blue-500" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* YOLOv8 模型 */}
          <div>
            <h4 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
              <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-xs font-bold">YOLOv8</span>
              经典版本 - 兼容旧项目
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {yolov8Models.map(model => (
                <button
                  key={model.id}
                  onClick={() => setConfig(prev => ({ ...prev, model_size: model.id }))}
                  className={`relative p-4 rounded-xl border-2 text-left transition-all ${config.model_size === model.id
                    ? 'border-blue-500 bg-gray-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <div className="text-lg font-bold text-gray-700">{model.name}</div>
                  <p className="text-xs text-gray-500 mt-0.5">{model.subtitle}</p>
                  <div className="mt-3 grid grid-cols-2 gap-1 text-xs text-gray-600">
                    <span>参数: {model.params}</span>
                    <span>速度: {model.speed}</span>
                    <span>大小: {model.size}</span>
                    <span className="text-amber-500">精度: {model.accuracy}</span>
                  </div>
                  {config.model_size === model.id && (
                    <div className="absolute bottom-2 right-2">
                      <Check size={18} className="text-blue-500" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* 第三步：训练参数 - 选择模型后显示 */}
      {config.data_dir && config.model_size && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Settings2 size={20} className="text-amber-500" />
            训练参数配置
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Epochs */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Hash size={14} />
                训练轮数
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={config.epochs}
                onChange={(e) => setConfig(prev => ({ ...prev, epochs: parseInt(e.target.value) || 100 }))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400"
              />
            </div>

            {/* Batch Size */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Layers size={14} />
                批次大小
              </label>
              <select
                value={config.batch}
                onChange={(e) => setConfig(prev => ({ ...prev, batch: parseInt(e.target.value) }))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400"
              >
                <option value={4}>4</option>
                <option value={8}>8</option>
                <option value={12}>12</option>
                <option value={16}>16</option>
                <option value={32}>32</option>
              </select>
            </div>

            {/* Image Size */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <ImageIcon size={14} />
                图片尺寸
              </label>
              <select
                value={config.imgsz}
                onChange={(e) => setConfig(prev => ({ ...prev, imgsz: parseInt(e.target.value) }))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400"
              >
                <option value={416}>416</option>
                <option value={512}>512</option>
                <option value={640}>640 (标准)</option>
                <option value={800}>800</option>
                <option value={1024}>1024</option>
              </select>
            </div>

            {/* Train Ratio */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Percent size={14} />
                训练集比例
              </label>
              <select
                value={config.train_ratio}
                onChange={(e) => setConfig(prev => ({ ...prev, train_ratio: parseFloat(e.target.value) }))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400"
              >
                <option value={0.7}>70%</option>
                <option value={0.8}>80%</option>
                <option value={0.9}>90%</option>
              </select>
            </div>
          </div>

          {/* Data Augmentation & Project Name */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 数据增强开关 */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium text-gray-900 flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-500" />
                  数据增强
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  使用旋转、翻转等方法增加数据多样性
                </div>
              </div>
              <button
                onClick={() => setConfig(prev => ({ ...prev, augment: !prev.augment }))}
                className={`relative w-12 h-6 rounded-full transition-colors ${config.augment ? 'bg-blue-500' : 'bg-gray-300'
                  }`}
              >
                <div
                  className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${config.augment ? 'translate-x-6' : ''
                    }`}
                />
              </button>
            </div>

            {/* 项目名称 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">项目名称（可选）</label>
              <input
                type="text"
                value={config.project_name}
                onChange={(e) => setConfig(prev => ({ ...prev, project_name: e.target.value }))}
                placeholder="例如: 车门划痕检测v1"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400"
              />
            </div>
          </div>

          {/* 正样本训练开关 */}
          <div className="mt-4 flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-100">
            <div>
              <div className="font-medium text-gray-900 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-500" />
                正样本训练
              </div>
              <div className="text-sm text-gray-500 mt-1">
                将未标注的图片作为无缺陷正样本参与训练，提升模型精度
              </div>
            </div>
            <button
              onClick={() => setConfig(prev => ({ ...prev, include_positive: !prev.include_positive }))}
              className={`relative w-12 h-6 rounded-full transition-colors ${config.include_positive ? 'bg-green-500' : 'bg-gray-300'
                }`}
            >
              <div
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${config.include_positive ? 'translate-x-6' : ''
                  }`}
              />
            </button>
          </div>
        </motion.div>
      )}

      {/* 第四步：配置摘要和启动 - 参数配置后显示 */}
      {config.data_dir && config.model_size && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-100 p-6"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* 配置摘要 */}
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Zap size={20} className="text-blue-500" />
                准备就绪
              </h3>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="px-3 py-1 bg-white rounded-full border border-gray-200">
                  数据集: <strong>{config.data_dir}</strong>
                </span>
                <span className="px-3 py-1 bg-white rounded-full border border-gray-200">
                  模型: <strong>{modelOptions.find(m => m.id === config.model_size)?.name}</strong>
                </span>
                <span className="px-3 py-1 bg-white rounded-full border border-gray-200">
                  轮数: <strong>{config.epochs}</strong>
                </span>
                <span className="px-3 py-1 bg-white rounded-full border border-gray-200">
                  尺寸: <strong>{config.imgsz}×{config.imgsz}</strong>
                </span>
                <span className={`px-3 py-1 rounded-full border ${config.augment ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                  增强: <strong>{config.augment ? '启用' : '禁用'}</strong>
                </span>
                <span className={`px-3 py-1 rounded-full border ${config.include_positive ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                  正样本: <strong>{config.include_positive ? '启用' : '禁用'}</strong>
                </span>
              </div>
            </div>

            {/* 启动按钮 */}
            <button
              onClick={handleStartTraining}
              disabled={isStarting || trainingStatus.is_training}
              className={`px-8 py-4 rounded-xl font-semibold text-lg flex items-center gap-3 transition-all ${isStarting || trainingStatus.is_training
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-200/50 hover:shadow-xl hover:-translate-y-0.5'
                }`}
            >
              {isStarting ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  启动中...
                </>
              ) : trainingStatus.is_training ? (
                <>
                  <Cpu className="w-5 h-5" />
                  训练进行中...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  开始训练
                </>
              )}
            </button>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-700">启动失败</p>
                <p className="text-sm text-red-600 mt-1">{error}</p>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default TrainingConfig;
