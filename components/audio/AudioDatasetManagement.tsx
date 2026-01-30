import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Music, Plus, Upload, Play, Pause, Trash2, FileAudio,
  ChevronLeft, Loader, CheckCircle, XCircle, AlertCircle,
  Database, Layers, ChevronDown, Headphones, Clock
} from 'lucide-react';
import { ViewType } from '../../types';
import { useAudioDatasetStore } from '../../store/useAudioDatasetStore';
import { AudioFile, AudioAnomalyType, AudioSeverity, TimeSegmentAnnotation } from '../../types/dataset';
import { CreateAudioDatasetModal } from './CreateAudioDatasetModal';
import { AudioAnnotation } from './AudioAnnotation';
import { LoadingSpinner, Skeleton } from '../LoadingSpinner';

// 项目列表定义 - 与 DatasetDashboard 保持一致
const PROJECTS = [
  { id: 'visual-defect', name: '外观缺陷检测', description: '汽车零部件外观缺陷' },
  { id: 'audio-anomaly', name: '听觉异响检测', description: '音频异常检测' }
];

interface AudioDatasetManagementProps {
  onViewChange: (view: ViewType) => void;
  onProjectChange?: (projectId: string) => void;
}

export const AudioDatasetManagement: React.FC<AudioDatasetManagementProps> = ({ onViewChange, onProjectChange }) => {
  const {
    datasets,
    currentDataset,
    isLoading,
    fetchAudioDatasets,
    createAudioDataset,
    getAudioDataset,
    uploadAudioFile,
    annotateAudio,
    setCurrentDataset
  } = useAudioDatasetStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [selectedAudio, setSelectedAudio] = useState<AudioFile | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const currentProject = PROJECTS[1]; // 当前是音频项目

  // 导入默认音频数据 (静默模式)
  const handleImportDefaultAudio = async () => {
    setIsImporting(true);
    try {
      const response = await fetch('http://localhost:5002/api/datasets/audio/import-default', {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        console.log(`[AudioDataset] Auto-imported: ${data.message}`);
        await fetchAudioDatasets();
      } else {
        console.error(`[AudioDataset] Import failed: ${data.error}`);
      }
    } catch (e) {
      console.error('[AudioDataset] Request failed');
    } finally {
      setIsImporting(false);
    }
  };

  // 初始化加载数据
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (hasInitialized) return;

    const initData = async () => {
      await fetchAudioDatasets();
      setHasInitialized(true);
    };
    initData();
  }, [fetchAudioDatasets, hasInitialized]);

  // 自动导入逻辑 - 仅在初始化完成后检查
  useEffect(() => {
    if (hasInitialized && !isLoading && datasets.length === 0) {
      handleImportDefaultAudio();
    }
  }, [hasInitialized, isLoading, datasets.length]);

  // 切换到视觉项目
  const handleProjectChange = (projectId: string) => {
    if (projectId === 'visual-defect') {
      if (onProjectChange) {
        onProjectChange(projectId);
      }
      // 通知父组件切换项目
      onViewChange(ViewType.DATASET_HOME);
    }
    setShowProjectDropdown(false);
  };

  const handleCreateDataset = async (name: string, description: string) => {
    const dataset = await createAudioDataset(name, description);
    if (dataset) {
      setCurrentDataset(dataset.id);
      await getAudioDataset(dataset.id);
    }
  };

  const handleUploadAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentDataset || !e.target.files?.length) return;

    const files: File[] = Array.from(e.target.files);

    for (const file of files) {
      if (!file.name.endsWith('.wav')) {
        alert(`${file.name} 不是WAV格式，已跳过`);
        continue;
      }

      const fileId = `${Date.now()}_${file.name}`;
      setUploadingFiles(prev => new Set([...prev, fileId]));

      try {
        await uploadAudioFile(currentDataset.id, file);
      } catch (error) {
        alert(`上传失败: ${file.name}`);
      } finally {
        setUploadingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(fileId);
          return newSet;
        });
      }
    }

    // 刷新数据
    await getAudioDataset(currentDataset.id);
  };

  const handleAnnotate = (audio: AudioFile) => {
    setSelectedAudio(audio);
    setShowAnnotation(true);
  };

  const handleSaveAnnotation = async (annotation: {
    anomalyType: AudioAnomalyType;
    severity: AudioSeverity;
    notes: string;
    segments?: TimeSegmentAnnotation[];  // 时间区间精细化标注
  }) => {
    if (!currentDataset || !selectedAudio) return;

    try {
      await annotateAudio(currentDataset.id, selectedAudio.id, annotation);
      await getAudioDataset(currentDataset.id);

      // 关闭标注Modal
      setShowAnnotation(false);
      setSelectedAudio(null);
    } catch (error) {
      console.error('Failed to save annotation:', error);
      // 错误已经在store中处理，这里不需要额外处理
    }
  };

  // 统计数据
  const totalDatasets = datasets.length;
  const totalAudios = datasets.reduce((sum, d) => sum + (d.audioFiles?.length || 0), 0);
  const totalAnnotated = datasets.reduce((sum, d) => sum + (d.audioFiles?.filter(f => f.isAnnotated)?.length || 0), 0);
  const inProgressCount = datasets.filter(d => {
    const annotated = d.audioFiles?.filter(f => f.isAnnotated)?.length || 0;
    const total = d.audioFiles?.length || 0;
    return annotated > 0 && annotated < total;
  }).length;

  if (!currentDataset) {
    // 数据集列表视图
    return (
      <div className="container mx-auto px-10 py-8 max-w-[1440px]">
        {/* Header - 与视觉页面保持一致 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <h1 className="text-3xl font-bold text-lx-black">{currentProject.name} 数据集</h1>
              {/* 项目选择器 */}
              <div className="relative">
                <button
                  onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                >
                  <Layers size={14} />
                  切换项目
                  <ChevronDown size={14} className={`transition-transform ${showProjectDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showProjectDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowProjectDropdown(false)}
                    />
                    <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                      <div className="p-2">
                        <div className="text-xs text-gray-400 px-3 py-2">选择项目</div>
                        {PROJECTS.map(project => (
                          <button
                            key={project.id}
                            onClick={() => handleProjectChange(project.id)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${currentProject.id === project.id
                              ? 'bg-purple-50 text-purple-600'
                              : 'hover:bg-gray-50 text-gray-700'
                              }`}
                          >
                            <div className="font-medium">{project.name}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{project.description}</div>
                          </button>
                        ))}
                      </div>
                      <div className="border-t border-gray-100 p-2">
                        <div className="px-3 py-2 text-xs text-gray-400">
                          更多项目敬请期待...
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            <p className="text-lx-textSub text-sm">听觉大师 · {currentProject.description}数据管理</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg hover:shadow-lg transition-all font-medium"
            >
              <Plus size={18} />
              新建数据集
            </button>
            {isImporting && (
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-500 rounded-lg text-sm">
                <LoadingSpinner size="small" />
                <span>正在初始化示例数据...</span>
              </div>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
          <StatCard
            icon={<Database className="w-5 h-5" />}
            label="数据集总数"
            value={totalDatasets}
            color="#8b5cf6"
          />
          <StatCard
            icon={<Headphones className="w-5 h-5" />}
            label="音频总量"
            value={totalAudios}
            color="#3b82f6"
          />
          <StatCard
            icon={<CheckCircle className="w-5 h-5" />}
            label="已标注音频"
            value={totalAnnotated}
            color="#22c55e"
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="进行中任务"
            value={inProgressCount}
            color="#f59e0b"
          />
        </div>

        {/* 数据集列表 */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader className="animate-spin text-purple-500" size={32} />
          </div>
        ) : datasets.length === 0 ? (
          <div className="text-center py-16">
            <Music size={64} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">暂无音频数据集</h3>
            <p className="text-gray-500 mb-6">创建第一个音频数据集开始标注</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg hover:shadow-lg transition-all inline-flex items-center gap-2"
            >
              <Plus size={20} />
              创建数据集
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {datasets.map(dataset => {
              const annotated = dataset.audioFiles.filter(f => f.isAnnotated).length;
              const total = dataset.audioFiles.length;
              const progress = total > 0 ? (annotated / total) * 100 : 0;

              return (
                <motion.div
                  key={dataset.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all cursor-pointer"
                  onClick={() => {
                    setCurrentDataset(dataset.id);
                    getAudioDataset(dataset.id);
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center flex-shrink-0">
                      <Music className="text-white" size={24} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{dataset.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">{dataset.description}</p>

                      <div className="mt-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">进度</span>
                          <span className="font-medium text-purple-600">{progress.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>{annotated} 已标注</span>
                          <span>共 {total} 个</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* 创建Modal */}
        <CreateAudioDatasetModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateDataset}
        />
      </div>
    );
  }

  // 数据集详情视图
  const audioFiles = currentDataset.audioFiles || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCurrentDataset('')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{currentDataset.name}</h1>
              <p className="text-sm text-gray-500 mt-1">{currentDataset.description}</p>
            </div>
          </div>
          <label className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer">
            <Upload size={18} />
            上传音频
            <input
              type="file"
              multiple
              accept=".wav"
              onChange={handleUploadAudio}
              className="hidden"
            />
          </label>
        </div>

        {/* 音频列表 */}
        {audioFiles.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <FileAudio size={64} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">暂无音频文件</h3>
            <p className="text-gray-500">上传WAV格式的音频文件开始标注</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {audioFiles.map(audio => (
              <motion.div
                key={audio.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <FileAudio className="text-purple-600" size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 text-sm truncate">{audio.filename}</h4>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      <span>{audio.duration.toFixed(1)}s</span>
                      <span>•</span>
                      <span>{(audio.sampleRate / 1000).toFixed(1)}kHz</span>
                    </div>

                    {audio.isAnnotated ? (
                      <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle size={14} />
                        已标注
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                        <XCircle size={14} />
                        未标注
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleAnnotate(audio)}
                  className="w-full mt-3 px-3 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg hover:shadow-md transition-all text-sm"
                >
                  {audio.isAnnotated ? '编辑标注' : '开始标注'}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* 标注Modal */}
      {showAnnotation && selectedAudio && (
        <AudioAnnotation
          audioFile={selectedAudio}
          datasetId={currentDataset.id}
          onSave={handleSaveAnnotation}
          onClose={() => {
            setShowAnnotation(false);
            setSelectedAudio(null);
          }}
        />
      )}
    </div>
  );
};

// 统计卡片组件
const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}> = ({ icon, label, value, color }) => (
  <div className="bg-white p-5 rounded-xl shadow-sm border-l-[3px]" style={{ borderLeftColor: color }}>
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm text-gray-500 mb-1">{label}</div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
      </div>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15`, color }}>
        {icon}
      </div>
    </div>
  </div>
);
