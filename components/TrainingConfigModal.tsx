import React, { useState, useEffect } from 'react';
import { X, Zap, Settings, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Dataset } from '../types/dataset';
import axios from 'axios';
import API_ENDPOINTS from '../config/api';

interface TrainingConfig {
  dataset_id: string;
  model_size: 'nano' | 'small' | 'medium';
  epochs: number;
  augment: boolean;
  project_name: string;
  imgsz: number;
  batch: number | null;
}

interface TrainingConfigModalProps {
  dataset: Dataset;
  onClose: () => void;
  onSuccess: (taskId: string) => void;
}

const modelOptions = [
  {
    id: 'nano' as const,
    name: 'YOLO11n',
    subtitle: '轻量级',
    params: '2.6M',
    speed: '最快',
    accuracy: '★★★★☆',
    color: 'from-emerald-500 to-green-500',
    batch: 16
  },
  {
    id: 'small' as const,
    name: 'YOLO11s',
    subtitle: '推荐',
    params: '9.4M',
    speed: '快速',
    accuracy: '★★★★☆',
    color: 'from-blue-500 to-cyan-500',
    batch: 12
  },
  {
    id: 'medium' as const,
    name: 'YOLO11m',
    subtitle: '高精度',
    params: '20.1M',
    speed: '中等',
    accuracy: '★★★★★',
    color: 'from-violet-500 to-purple-500',
    batch: 8
  }
];

export const TrainingConfigModal: React.FC<TrainingConfigModalProps> = ({
  dataset,
  onClose,
  onSuccess
}) => {
  // Debug log to ensure new component is loaded
  React.useEffect(() => {
    console.log('TrainingConfigModal mounted - Sequential Wizard Active');
  }, []);

  const [config, setConfig] = useState<TrainingConfig>({
    dataset_id: dataset.id,
    model_size: 'small',
    epochs: 100,
    augment: true,
    project_name: `${dataset.name}_model`,
    imgsz: 640,
    batch: null
  });

  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 自动调整batch size
  useEffect(() => {
    const selectedModel = modelOptions.find(m => m.id === config.model_size);
    if (selectedModel) {
      setConfig(prev => ({ ...prev, batch: selectedModel.batch }));
    }
  }, [config.model_size]);

  // 步骤定义
  const steps = [
    { id: 'model', title: '选择模型', description: '选择适合的模型量级' },
    { id: 'params', title: '训练参数', description: '配置训练轮数和图片尺寸' },
    { id: 'project', title: '高级配置', description: '设置增强和项目名称' }
  ];

  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleStart = async () => {
    // 验证
    if (dataset.stats.annotatedImages === 0) {
      setError('数据集没有标注数据，请先完成标注');
      return;
    }

    if (config.epochs < 1 || config.epochs > 500) {
      setError('训练轮数必须在 1-500 之间');
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      const response = await axios.post(API_ENDPOINTS.TRAINING.START_FROM_DATASET, config);

      if (response.data.success) {
        onSuccess(response.data.task_id);
      } else {
        setError(response.data.error || '启动训练失败');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || '网络错误');
    } finally {
      setIsStarting(false);
    }
  };

  // 渲染当前步骤内容
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            {/* 模型选择 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {modelOptions.map((model) => (
                <button
                  key={model.id}
                  onClick={() => setConfig(prev => ({ ...prev, model_size: model.id }))}
                  className={`relative p-4 rounded-xl border-2 transition-all text-left ${config.model_size === model.id
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                    }`}
                >
                  {config.model_size === model.id && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle2 size={18} className="text-blue-500" />
                    </div>
                  )}
                  <div className={`inline-block px-2 py-1 rounded-lg bg-gradient-to-r ${model.color} text-white text-xs font-bold mb-2`}>
                    {model.name}
                  </div>
                  <p className="text-xs text-gray-500 mb-1">{model.subtitle}</p>
                  <div className="text-xs text-gray-600 space-y-0.5">
                    <div>参数: {model.params}</div>
                    <div>速度: {model.speed}</div>
                    <div>精度: {model.accuracy}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* 数据集信息摘要 - 放在第一步下方作为参考 */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Settings size={16} className="text-gray-500" />
                <span className="text-sm font-semibold text-gray-700">当前数据集: {dataset.name}</span>
              </div>
              <div className="text-xs text-gray-500 flex gap-4">
                <span>图片: {dataset.stats.totalImages}</span>
                <span>已标注: {dataset.stats.annotatedImages}</span>
                <span>类别: {dataset.defectTypes.length}</span>
              </div>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  训练轮数 (Epochs)
                </label>
                <input
                  type="number"
                  value={config.epochs}
                  onChange={(e) => setConfig(prev => ({ ...prev, epochs: parseInt(e.target.value) || 0 }))}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-lg"
                  min="1"
                  max="500"
                />
                <p className="text-xs text-gray-500 mt-2">
                  默认 100。增加轮数可能提高精度，但训练时间更长。
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  图片尺寸 (Image Size)
                </label>
                <select
                  value={config.imgsz}
                  onChange={(e) => setConfig(prev => ({ ...prev, imgsz: parseInt(e.target.value) }))}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-lg"
                >
                  <option value="640">640 (标准)</option>
                  <option value="800">800 (高精度)</option>
                  <option value="1024">1024 (超高精度)</option>
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  更大的尺寸能检测更小的缺陷，但会消耗更多显存。
                </p>
              </div>
            </div>

            {/* 预期时间 */}
            <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700 border border-blue-100 flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <Zap size={18} className="text-blue-500" />
              </div>
              <div>
                <p className="font-semibold mb-0.5">预计训练时间</p>
                <p className="opacity-80">
                  约 {Math.ceil(config.epochs * dataset.stats.annotatedImages / 300)} - {Math.ceil(config.epochs * dataset.stats.annotatedImages / 150)} 分钟 (基于当前配置)
                </p>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            {/* 数据增强 */}
            <div className="bg-white border-2 border-gray-100 p-4 rounded-xl hover:border-gray-200 transition-colors">
              <label className="flex items-center gap-4 cursor-pointer">
                <div className={`w-6 h-6 rounded border flex items-center justify-center transition-colors ${config.augment ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white'}`}>
                  {config.augment && <CheckCircle2 size={16} className="text-white" />}
                </div>
                <input
                  type="checkbox"
                  checked={config.augment}
                  onChange={(e) => setConfig(prev => ({ ...prev, augment: e.target.checked }))}
                  className="hidden"
                />
                <div>
                  <span className="text-base font-semibold text-gray-800">启用数据增强 Mosaic</span>
                  <p className="text-sm text-gray-500 mt-0.5">
                    自动应用旋转、缩放、翻转等19种变换，显著提升模型泛化能力。
                  </p>
                </div>
              </label>
            </div>

            {/* 项目名称 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                项目名称 (Project Name)
              </label>
              <input
                type="text"
                value={config.project_name}
                onChange={(e) => setConfig(prev => ({ ...prev, project_name: e.target.value }))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                placeholder="输入项目名称"
              />
              <p className="text-xs text-gray-500 mt-2">
                训练结果将保存到此项目文件夹中。
              </p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white rounded-t-2xl">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">模型训练配置</h2>
            <p className="text-sm text-gray-500 mt-1">请按步骤完成训练参数配置</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* Steps Indicator */}
        <div className="px-8 py-4 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center justify-between relative">
            {/* Progress Bar Background */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-gray-200 rounded-full -z-0"></div>
            {/* Progress Bar Active */}
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-blue-500 rounded-full -z-0 transition-all duration-300"
              style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
            ></div>

            {steps.map((step, idx) => {
              const isActive = idx === currentStep;
              const isCompleted = idx < currentStep;

              return (
                <div key={idx} className="flex flex-col items-center relative z-10 group cursor-pointer" onClick={() => idx < currentStep && setCurrentStep(idx)}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 border-4 border-white ${isActive ? 'bg-blue-600 text-white shadow-lg scale-110' :
                    isCompleted ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>
                    {isCompleted ? <CheckCircle2 size={16} /> : idx + 1}
                  </div>
                  <span className={`text-xs font-medium mt-2 transition-colors ${isActive ? 'text-blue-700' : 'text-gray-500'
                    }`}>
                    {step.title}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 relative min-h-[400px]">
          {renderStepContent()}

          {/* 错误提示 */}
          {error && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 animate-pulse">
              <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-900">无法启动训练</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-8 py-5 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className={`px-6 py-2.5 rounded-xl font-medium transition-colors ${currentStep === 0
              ? 'text-gray-300 cursor-not-allowed hidden'
              : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'
              }`}
          >
            上一步
          </button>

          <div className="flex items-center gap-3">
            {currentStep < steps.length - 1 ? (
              <button
                onClick={handleNext}
                className="px-8 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-all hover:shadow-lg flex items-center gap-2"
              >
                下一步
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={isStarting || dataset.stats.annotatedImages === 0}
                className="px-8 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-medium hover:shadow-lg hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isStarting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    启动中...
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    开始训练
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
