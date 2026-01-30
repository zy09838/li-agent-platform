import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Music, Play, Settings, AlertCircle, Loader, Database } from 'lucide-react';
import { useAudioDatasetStore } from '../../store/useAudioDatasetStore';

interface AudioTrainingConfigProps {
  onStartTraining: () => void;
  onNavigateToDatasets?: () => void;  // 新增：导航到数据集管理的回调
}

const AudioTrainingConfig: React.FC<AudioTrainingConfigProps> = ({
  onStartTraining,
  onNavigateToDatasets
}) => {
  const { datasets, fetchAudioDatasets } = useAudioDatasetStore();
  const [selectedDataset, setSelectedDataset] = useState('');
  const [contamination, setContamination] = useState(0.45);
  const [featureSelection, setFeatureSelection] = useState<'hybrid' | 'discrimination' | 'variance' | 'correlation'>('hybrid');
  const [topFeatures, setTopFeatures] = useState(15);
  const [useEnhanced, setUseEnhanced] = useState(true);
  const [isTraining, setIsTraining] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('[AudioTrainingConfig] Loading audio datasets...');
        await fetchAudioDatasets();
        console.log('[AudioTrainingConfig] Loaded datasets:', datasets.length);
      } catch (error) {
        console.error('[AudioTrainingConfig] Failed to load datasets:', error);
        alert('加载音频数据集失败，请检查后端服务是否运行在 http://localhost:5002');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [fetchAudioDatasets]);

  const handleStartTraining = async () => {
    if (!selectedDataset) {
      alert('请选择音频数据集');
      return;
    }

    const dataset = datasets.find(d => d.id === selectedDataset);
    if (!dataset) return;

    const annotatedCount = dataset.audioFiles.filter(f => f.isAnnotated).length;
    const MIN_SAMPLES = 20;  // 提高到20个样本

    if (annotatedCount < MIN_SAMPLES) {
      alert(
        `音频异常检测模型需要至少 ${MIN_SAMPLES} 个已标注样本才能获得良好效果。\n\n` +
        `当前只有 ${annotatedCount} 个已标注样本。\n\n` +
        `建议：\n` +
        `• 继续标注更多音频以提升模型精度\n` +
        `• 至少标注 ${MIN_SAMPLES} 个不同场景的音频样本\n` +
        `• 包含正常和异常两种类型的音频`
      );
      return;
    }

    setIsTraining(true);

    try {
      console.log('[AudioTrainingConfig] Starting training for dataset:', selectedDataset);
      const response = await fetch('http://localhost:5001/api/train/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_id: selectedDataset,
          config: {
            contamination,
            featureSelection,
            topFeatures,
            useEnhancedFeatures: useEnhanced
          }
        })
      });

      const data = await response.json();
      console.log('[AudioTrainingConfig] Training response:', data);

      if (data.success) {
        onStartTraining();
      } else {
        alert('训练启动失败: ' + (data.error || '未知错误'));
      }
    } catch (error) {
      console.error('[AudioTrainingConfig] Training failed:', error);
      alert('训练启动失败: ' + (error as Error).message);
    } finally {
      setIsTraining(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="animate-spin text-purple-500" size={32} />
      </div>
    );
  }

  const selectedDatasetObj = datasets.find(d => d.id === selectedDataset);
  const annotatedCount = selectedDatasetObj?.audioFiles.filter(f => f.isAnnotated).length || 0;
  const totalCount = selectedDatasetObj?.audioFiles.length || 0;

  return (
    <div className="space-y-6">
      {/* 数据集选择 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Music size={20} className="text-purple-500" />
          选择音频数据集
        </h3>

        {datasets.length === 0 ? (
          <div className="text-center py-8">
            <Music size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">暂无音频数据集</p>
            <p className="text-sm text-gray-400 mt-1">
              请先创建音频数据集并标注音频文件
            </p>
            {onNavigateToDatasets && (
              <button
                onClick={onNavigateToDatasets}
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
              >
                <Database size={18} />
                前往数据集管理
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {datasets.map(dataset => {
              const annotated = dataset.audioFiles.filter(f => f.isAnnotated).length;
              const total = dataset.audioFiles.length;
              const progress = total > 0 ? (annotated / total) * 100 : 0;

              return (
                <button
                  key={dataset.id}
                  onClick={() => setSelectedDataset(dataset.id)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedDataset === dataset.id
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{dataset.name}</h4>
                      <p className="text-sm text-gray-500 mt-1">{dataset.description}</p>
                      <div className="mt-3 flex items-center gap-4 text-sm">
                        <span className="text-gray-600">
                          总数: <span className="font-medium">{total}</span>
                        </span>
                        <span className="text-gray-600">
                          已标注: <span className="font-medium text-purple-600">{annotated}</span>
                        </span>
                        <span className="text-gray-600">
                          完成率: <span className="font-medium">{progress.toFixed(0)}%</span>
                        </span>
                      </div>
                    </div>
                    {selectedDataset === dataset.id && (
                      <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 训练参数 */}
      {selectedDataset && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-gray-200 p-6 space-y-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Settings size={20} className="text-purple-500" />
            训练参数配置
          </h3>

          {/* 污染率 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              污染率 (Contamination): {contamination.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={contamination}
              onChange={(e) => setContamination(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              预期异常样本的比例，默认0.45表示45%的样本为异常
            </p>
          </div>

          {/* 特征选择方法 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              特征选择方法
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'hybrid', label: 'Hybrid (推荐)', desc: '平衡性能和准确率' },
                { value: 'discrimination', label: 'Discrimination', desc: '高准确率' },
                { value: 'variance', label: 'Variance', desc: '快速训练' },
                { value: 'correlation', label: 'Correlation', desc: '相关性分析' }
              ].map(method => (
                <button
                  key={method.value}
                  onClick={() => setFeatureSelection(method.value as any)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    featureSelection === method.value
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm">{method.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{method.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 特征数量 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              特征数量: {topFeatures}
            </label>
            <input
              type="range"
              min="5"
              max="30"
              step="1"
              value={topFeatures}
              onChange={(e) => setTopFeatures(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              选择的特征数量，推荐15-20个
            </p>
          </div>

          {/* 使用增强特征 */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <div className="font-medium text-gray-900">使用增强特征</div>
              <div className="text-sm text-gray-500 mt-1">
                启用94维增强特征（包含Tonnetz、Poly、Tempogram等）
              </div>
            </div>
            <button
              onClick={() => setUseEnhanced(!useEnhanced)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                useEnhanced ? 'bg-purple-500' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  useEnhanced ? 'translate-x-6' : ''
                }`}
              />
            </button>
          </div>

          {/* 数据统计提示 */}
          <div className={`p-4 border rounded-lg ${
            annotatedCount >= 20
              ? 'bg-green-50 border-green-200'
              : annotatedCount >= 10
              ? 'bg-amber-50 border-amber-200'
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-start gap-3">
              <AlertCircle className={`flex-shrink-0 mt-0.5 ${
                annotatedCount >= 20
                  ? 'text-green-600'
                  : annotatedCount >= 10
                  ? 'text-amber-600'
                  : 'text-red-600'
              }`} size={20} />
              <div className={`text-sm ${
                annotatedCount >= 20
                  ? 'text-green-700'
                  : annotatedCount >= 10
                  ? 'text-amber-700'
                  : 'text-red-700'
              }`}>
                <p className="font-medium">数据集状态</p>
                <ul className="mt-2 space-y-1">
                  <li>• 总音频数: <strong>{totalCount}</strong></li>
                  <li>• 已标注: <strong>{annotatedCount}</strong></li>
                  <li className="flex items-center gap-1">
                    {annotatedCount >= 20 ? (
                      <>
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-600"></span>
                        <span>✅ 样本数充足，可以开始训练</span>
                      </>
                    ) : annotatedCount >= 10 ? (
                      <>
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                        <span>⚠️ 建议至少标注20个音频（当前 {annotatedCount}/20）</span>
                      </>
                    ) : (
                      <>
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-600"></span>
                        <span>❌ 样本数不足，至少需要20个（当前 {annotatedCount}/20）</span>
                      </>
                    )}
                  </li>
                  {annotatedCount < 20 && (
                    <li className="text-xs opacity-80 mt-2">
                      💡 提示：更多的标注样本能显著提升模型准确率
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* 开始训练按钮 */}
      {selectedDataset && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-end"
        >
          <button
            onClick={handleStartTraining}
            disabled={isTraining || annotatedCount < 20}
            className="px-8 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-lg font-medium"
            title={annotatedCount < 20 ? `至少需要20个已标注样本（当前${annotatedCount}个）` : ''}
          >
            {isTraining ? (
              <>
                <Loader className="animate-spin" size={20} />
                训练中...
              </>
            ) : (
              <>
                <Play size={20} />
                开始训练 {annotatedCount < 20 && `(${annotatedCount}/20)`}
              </>
            )}
          </button>
        </motion.div>
      )}
    </div>
  );
};

export default AudioTrainingConfig;
