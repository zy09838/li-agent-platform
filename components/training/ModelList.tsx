import React, { useEffect, useState } from 'react';
import {
  Download, Trash2, TestTube, MoreVertical,
  Brain, Calendar, Database, Layers, Target,
  CheckCircle, Clock, XCircle, ChevronDown, ChevronUp, Tag,
  Rocket, Check, AlertCircle, Car, BarChart3
} from 'lucide-react';
import { useTrainingStore, ModelInfo } from '../../store/useTrainingStore';
import ModelEvaluation from './ModelEvaluation';

// 零件类型配置 - 与 VisionAgent 保持一致
const PART_TYPES = [
    { id: 'paint', name: '漆面', description: '车身漆面缺陷检测' },
    { id: 'electric_drive', name: '电驱动总成', description: '电驱动总成外观检测' },
    { id: 'glass', name: '玻璃', description: '车窗玻璃缺陷检测' },
] as const;

type PartType = typeof PART_TYPES[number]['id'];

interface ModelListProps {
  onTest: (modelId: string) => void;
  projectType?: string;
}

const ModelList: React.FC<ModelListProps> = ({ onTest, projectType = 'visual-defect' }) => {
  const {
    models,
    audioModels,
    fetchModels,
    fetchAudioModels,
    deleteModel,
    selectModel,
    apiBaseUrl,
    deployModel
  } = useTrainingStore();

  // 根据项目类型选择显示的模型列表
  const displayModels = projectType === 'audio-anomaly' ? audioModels : models;
  const isAudioProject = projectType === 'audio-anomaly';

  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deployConfirm, setDeployConfirm] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedPartType, setSelectedPartType] = useState<PartType>('paint');
  const [showEvaluation, setShowEvaluation] = useState<string | null>(null);

  useEffect(() => {
    if (projectType === 'audio-anomaly') {
      fetchAudioModels();
    } else {
      fetchModels();
    }
  }, [projectType]);

  const handleDownload = (model: ModelInfo) => {
    window.open(`${apiBaseUrl}/models/${model.id}/download`, '_blank');
  };

  const handleDelete = async (modelId: string) => {
    await deleteModel(modelId);
    setDeleteConfirm(null);
    setMenuOpenId(null);
  };

  const handleTest = (model: ModelInfo) => {
    selectModel(model.id);
    onTest(model.id);
  };

  const handleDeploy = async (modelId: string) => {
    setDeploying(true);
    setDeployResult(null);
    try {
      await deployModel(modelId, isAudioProject, selectedPartType);
      const partName = PART_TYPES.find(p => p.id === selectedPartType)?.name || selectedPartType;
      setDeployResult({ 
        success: true, 
        message: isAudioProject 
          ? `模型已成功部署到听觉大师智能体`
          : `模型已成功部署到视觉大师智能体 [${partName}]`
      });
      setTimeout(() => {
        setDeployConfirm(null);
        setDeployResult(null);
        setSelectedPartType('paint'); // 重置选择
      }, 2000);
    } catch (err: any) {
      setDeployResult({ success: false, message: err.message || '部署失败' });
    } finally {
      setDeploying(false);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '--';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
            <CheckCircle size={12} />
            完成
          </span>
        );
      case 'training':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
            <Clock size={12} />
            训练中
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
            <XCircle size={12} />
            失败
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">模型总数</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{displayModels.length}</p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${isAudioProject
              ? 'bg-gradient-to-br from-purple-400 to-pink-500 shadow-purple-200/50'
              : 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-200/50'
              }`}>
              <Brain className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {isAudioProject ? (
          <>
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">异常检测</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{displayModels.length}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-200/50">
                  <Layers className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">项目类型</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">音频异响</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-200/50">
                  <Layers className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">轻量模型</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {displayModels.filter(m => m.model_size === 'nano' || m.model_size === 'small' || m.model_size === 'v8nano').length}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-200/50">
                  <Layers className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">中等模型</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {displayModels.filter(m => m.model_size === 'medium' || m.model_size === 'v8medium').length}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center shadow-lg shadow-violet-200/50">
                  <Layers className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 模型列表 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {displayModels.length === 0 ? (
          <div className="py-20 text-center">
            <Brain className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">暂无{isAudioProject ? '音频' : '视觉'}模型</p>
            <p className="text-sm text-gray-400">在"训练配置"页面开始训练第一个模型</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {displayModels.map(model => (
              <div key={model.id} className="hover:bg-gray-50/50 transition-colors">
                {/* 主行 */}
                <div className="p-5 flex items-center gap-4">
                  {/* 展开/折叠 */}
                  <button
                    onClick={() => setExpandedModel(expandedModel === model.id ? null : model.id)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    {expandedModel === model.id ? (
                      <ChevronUp size={18} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={18} className="text-gray-400" />
                    )}
                  </button>

                  {/* 模型图标 */}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isAudioProject
                    ? 'bg-gradient-to-br from-purple-400 to-pink-500 shadow-lg shadow-purple-200/30'
                    : model.model_size === 'nano' || model.model_size === 'v8nano'
                      ? 'bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-200/30'
                      : 'bg-gradient-to-br from-violet-400 to-purple-500 shadow-lg shadow-violet-200/30'
                    }`}>
                    <Brain className="w-6 h-6 text-white" />
                  </div>

                  {/* 模型信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{model.name}</h3>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {getStatusBadge(model.status)}
                        {model.deployed && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full whitespace-nowrap">
                            <Rocket size={10} />
                            {model.deployed_part_type 
                              ? `已部署→${PART_TYPES.find(p => p.id === model.deployed_part_type)?.name || model.deployed_part_type}`
                              : '已部署'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-sm text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <Calendar size={14} />
                        {formatDate(model.created_at)}
                      </span>
                      {isAudioProject ? (
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <Tag size={14} />
                          异响检测
                        </span>
                      ) : (
                        <>
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <Database size={14} />
                            {model.dataset || '--'}
                          </span>
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <Tag size={14} />
                            {model.num_classes || 0} 类别
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 指标 */}
                  <div className="hidden lg:flex items-center gap-6 text-center">
                    {isAudioProject ? (
                      <>
                        <div>
                          <p className="text-xs text-gray-500">准确率</p>
                          <p className="text-lg font-semibold text-emerald-600">
                            {model.metrics?.accuracy ? (model.metrics.accuracy * 100).toFixed(1) + '%' : '--'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">精确率</p>
                          <p className="text-lg font-semibold text-gray-700">
                            {model.metrics?.precision ? (model.metrics.precision * 100).toFixed(1) + '%' : '--'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">类型</p>
                          <p className="text-lg font-semibold text-gray-700">异响</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-xs text-gray-500">mAP@50</p>
                          <p className="text-lg font-semibold text-emerald-600">
                            {model.metrics?.mAP50?.toFixed(3) || '--'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Epochs</p>
                          <p className="text-lg font-semibold text-gray-700">{model.epochs || '--'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">模型</p>
                          <p className="text-lg font-semibold text-gray-700">
                            {model.model_size === 'nano' ? 'YOLO11n' :
                              model.model_size === 'small' ? 'YOLO11s' :
                                model.model_size === 'medium' ? 'YOLO11m' :
                                  model.model_size === 'v8nano' ? 'YOLOv8n' :
                                    model.model_size === 'v8medium' ? 'YOLOv8m' :
                                      model.model_size || '--'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2">
                    {!isAudioProject && (
                      <button
                        onClick={() => setShowEvaluation(showEvaluation === model.id ? null : model.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          showEvaluation === model.id
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                        }`}
                      >
                        <BarChart3 size={16} />
                        评估
                      </button>
                    )}
                    <button
                      onClick={() => handleTest(model)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg text-sm font-medium transition-colors"
                    >
                      <TestTube size={16} />
                      测试
                    </button>
                    <button
                      onClick={() => handleDownload(model)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Download size={16} />
                      下载
                    </button>

                    {/* 更多菜单 */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menuOpenId === model.id) {
                            setMenuOpenId(null);
                          } else {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenuPosition({
                              top: rect.bottom + 4,
                              right: window.innerWidth - rect.right,
                            });
                            setMenuOpenId(model.id);
                          }
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <MoreVertical size={18} className="text-gray-400" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 展开详情 */}
                {expandedModel === model.id && (
                  <div className="px-5 pb-5 pt-2 bg-gray-50/50 border-t border-gray-100">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* 训练配置 */}
                      <div className="bg-white rounded-xl p-4">
                        <h4 className="text-sm font-medium text-gray-500 mb-3">训练配置</h4>
                        <div className="space-y-2 text-sm">
                          {isAudioProject ? (
                            <>
                              <div className="flex justify-between">
                                <span className="text-gray-500">检测类型</span>
                                <span className="text-gray-900">异常检测</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">创建时间</span>
                                <span className="text-gray-900">{formatDate(model.created_at)}</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex justify-between">
                                <span className="text-gray-500">图片尺寸</span>
                                <span className="text-gray-900">{model.imgsz || '--'}×{model.imgsz || '--'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">数据增强</span>
                                <span className={model.augment ? 'text-green-600' : 'text-gray-400'}>
                                  {model.augment ? '启用' : '禁用'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">训练轮数</span>
                                <span className="text-gray-900">{model.epochs || '--'}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 模型指标 */}
                      <div className="bg-white rounded-xl p-4">
                        <h4 className="text-sm font-medium text-gray-500 mb-3">模型指标</h4>
                        <div className="space-y-2 text-sm">
                          {isAudioProject ? (
                            <>
                              <div className="flex justify-between">
                                <span className="text-gray-500">准确率</span>
                                <span className="text-emerald-600 font-medium">
                                  {model.metrics?.accuracy ? (model.metrics.accuracy * 100).toFixed(2) + '%' : '--'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">精确率</span>
                                <span className="text-blue-600 font-medium">
                                  {model.metrics?.precision ? (model.metrics.precision * 100).toFixed(2) + '%' : '--'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">召回率</span>
                                <span className="text-gray-900">
                                  {model.metrics?.recall ? (model.metrics.recall * 100).toFixed(2) + '%' : '--'}
                                </span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex justify-between">
                                <span className="text-gray-500">mAP@50</span>
                                <span className="text-emerald-600 font-medium">
                                  {model.metrics?.mAP50?.toFixed(4) || '--'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">mAP@50-95</span>
                                <span className="text-blue-600 font-medium">
                                  {model.metrics?.['mAP50-95']?.toFixed(4) || '--'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Precision</span>
                                <span className="text-gray-900">
                                  {model.metrics?.precision?.toFixed(4) || '--'}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 类别信息 / 音频配置 */}
                      <div className="bg-white rounded-xl p-4 lg:col-span-2">
                        {isAudioProject ? (
                          <>
                            <h4 className="text-sm font-medium text-gray-500 mb-3">检测说明</h4>
                            <p className="text-sm text-gray-700">
                              该模型用于检测音频中的异常信号，如电机啸叫、结构异响等问题。
                            </p>
                          </>
                        ) : (
                          <>
                            <h4 className="text-sm font-medium text-gray-500 mb-3">检测类别 ({model.num_classes || 0})</h4>
                            <div className="flex flex-wrap gap-2">
                              {(model.classes || []).map(cls => (
                                <span
                                  key={cls}
                                  className="px-2.5 py-1 bg-gray-100 text-gray-700 text-sm rounded-lg"
                                >
                                  {cls}
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 模型路径 */}
                    <div className="mt-4 p-3 bg-gray-100 rounded-lg">
                      <p className="text-xs text-gray-500">模型路径</p>
                      <p className="text-sm text-gray-700 font-mono truncate">{model.model_path}</p>
                    </div>
                  </div>
                )}

                {/* 评估面板 */}
                {showEvaluation === model.id && !isAudioProject && (
                  <div className="px-5 pb-5 pt-2 bg-purple-50/30 border-t border-purple-100">
                    <ModelEvaluation modelId={model.id} projectType={projectType} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 更多操作菜单 - 使用fixed定位避免被裁剪 */}
      {menuOpenId && (
        <>
          <div
            className="fixed inset-0 z-[100]"
            onClick={() => setMenuOpenId(null)}
          />
          <div
            className="fixed z-[101] bg-white border border-gray-200 rounded-xl shadow-2xl py-2 w-[180px]"
            style={{
              top: menuPosition.top,
              right: menuPosition.right,
            }}
          >
            <button
              onClick={() => {
                setDeployConfirm(menuOpenId);
                setMenuOpenId(null);
              }}
              className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 text-emerald-600 flex items-center gap-2.5"
            >
              <Rocket size={15} />
              <span>部署到{isAudioProject ? '听觉大师' : '视觉大师'}</span>
            </button>
            <div className="border-t border-gray-100 my-1.5 mx-2" />
            <button
              onClick={() => {
                setDeleteConfirm(menuOpenId);
                setMenuOpenId(null);
              }}
              className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 text-red-500 flex items-center gap-2.5"
            >
              <Trash2 size={15} />
              <span>删除模型</span>
            </button>
          </div>
        </>
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">删除模型</h3>
                <p className="text-sm text-gray-500">此操作不可恢复</p>
              </div>
            </div>
            <p className="text-gray-600 mb-6">确定要删除这个模型吗？模型文件和训练记录都将被永久删除。</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 部署确认弹窗 */}
      {deployConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md mx-4 shadow-2xl">
            {deployResult ? (
              // 部署结果
              <div className="text-center py-4">
                {deployResult.success ? (
                  <>
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                      <Check className="w-8 h-8 text-green-500" />
                    </div>
                    <h3 className="font-semibold text-gray-900 text-lg mb-2">部署成功</h3>
                    <p className="text-gray-600">{deployResult.message}</p>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                      <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h3 className="font-semibold text-gray-900 text-lg mb-2">部署失败</h3>
                    <p className="text-red-600">{deployResult.message}</p>
                    <button
                      onClick={() => { setDeployConfirm(null); setDeployResult(null); }}
                      className="mt-4 px-6 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      关闭
                    </button>
                  </>
                )}
              </div>
            ) : (
              // 确认部署
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Rocket className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">部署模型</h3>
                    <p className="text-sm text-gray-500">部署到{isAudioProject ? '听觉大师' : '视觉大师'}智能体</p>
                  </div>
                </div>

                {/* 视觉模型需要选择零件类型 */}
                {!isAudioProject && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Car size={14} className="inline mr-1.5" />
                      选择零件类型
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {PART_TYPES.map(pt => (
                        <button
                          key={pt.id}
                          onClick={() => setSelectedPartType(pt.id)}
                          className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                            selectedPartType === pt.id
                              ? 'bg-amber-50 border-amber-300 text-amber-700 ring-1 ring-amber-200'
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {pt.name}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      {PART_TYPES.find(p => p.id === selectedPartType)?.description}
                    </p>
                  </div>
                )}

                <p className="text-gray-600 mb-2">
                  确定要将此模型部署到<span className="font-medium text-amber-600">{isAudioProject ? '听觉大师' : '视觉大师'}</span>智能体
                  {!isAudioProject && (
                    <span className="font-medium text-amber-600"> [{PART_TYPES.find(p => p.id === selectedPartType)?.name}]</span>
                  )} 吗？
                </p>
                <p className="text-sm text-gray-500 mb-6">
                  {isAudioProject 
                    ? '部署后，听觉大师将使用此模型进行异响检测推理。' 
                    : `部署后，视觉大师在检测「${PART_TYPES.find(p => p.id === selectedPartType)?.name}」类型零件时将使用此模型进行推理。`}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setDeployConfirm(null); setDeployResult(null); setSelectedPartType('paint'); }}
                    disabled={deploying}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => handleDeploy(deployConfirm)}
                    disabled={deploying}
                    className="flex-1 px-4 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {deploying ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        部署中...
                      </>
                    ) : (
                      <>
                        <Rocket size={16} />
                        确认部署
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelList;

