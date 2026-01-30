import React, { useState } from 'react';
import { ViewType } from '../types';
import {
  Database, Tag, FolderOpen, Search, Plus, Filter, X,
  Image as ImageIcon, CheckCircle, Clock, MoreVertical, Trash2, Edit2,
  ChevronDown, Layers, Zap
} from 'lucide-react';
import { useDatasetStore } from '../store/useDatasetStore';
import {
  Dataset,
  DatasetFilter,
  PartCategory,
  DefectType,
  AnnotationStatus,
  PART_CATEGORY_LABELS,
  DEFECT_TYPE_LABELS,
  DEFECT_TYPE_COLORS
} from '../types/dataset';
import { TrainingConfigModal } from './TrainingConfigModal';
import { LoadingSpinner, LoadingOverlay, Skeleton } from './LoadingSpinner';
import { Pagination } from './Pagination';
import { AudioDatasetManagement } from './audio/AudioDatasetManagement';

// 项目列表定义
const PROJECTS = [
  { id: 'visual-defect', name: '外观缺陷检测', description: '汽车零部件外观缺陷' },
  { id: 'audio-anomaly', name: '听觉异响检测', description: '音频异常检测' }
];

interface DatasetDashboardProps {
  onViewChange: (view: ViewType) => void;
}

export const DatasetDashboard: React.FC<DatasetDashboardProps> = ({ onViewChange }) => {
  const {
    datasets,
    filter,
    setFilter,
    clearFilter,
    getFilteredDatasets,
    setCurrentDataset,
    deleteDataset,
    fetchDatasets
  } = useDatasetStore();

  React.useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await fetchDatasets();
      
      // 自动导入默认数据集如果列表为空
      if (useDatasetStore.getState().datasets.length === 0) {
        // Double check after fetch
        await handleImportDefault();
      }
      setIsLoading(false);
    };
    loadData();
  }, []);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [currentProject, setCurrentProject] = useState(PROJECTS[0]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [trainingDataset, setTrainingDataset] = useState<Dataset | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDatasetsCount, setTotalDatasetsCount] = useState(0);

  // 过滤获取的数据集，确保只处理有效的图像数据集
  const rawFilteredDatasets = getFilteredDatasets();
  const filteredDatasets = rawFilteredDatasets.filter(ds => 
    ds.partCategory && ds.defectTypes && ds.images && ds.stats
  );

  // 分页后的数据集
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedDatasets = filteredDatasets.slice(startIndex, endIndex);

  // 更新总页数
  React.useEffect(() => {
    setTotalDatasetsCount(filteredDatasets.length);
    setTotalPages(Math.ceil(filteredDatasets.length / pageSize));
    // 如果当前页超出范围，重置到第一页
    if (currentPage > Math.ceil(filteredDatasets.length / pageSize) && filteredDatasets.length > 0) {
      setCurrentPage(1);
    }
  }, [filteredDatasets.length, pageSize, currentPage]);

  // 统计数据 - 只统计有效的图像数据集
  const validDatasets = datasets.filter(ds => ds.partCategory && ds.defectTypes && ds.images && ds.stats);
  const totalDatasets = validDatasets.length;
  const totalImages = validDatasets.reduce((sum, d) => sum + (d.stats?.totalImages || 0), 0);
  const totalAnnotated = validDatasets.reduce((sum, d) => sum + (d.stats?.annotatedImages || 0), 0);
  const inProgressCount = validDatasets.filter(d =>
    d.stats && d.stats.annotatedImages > 0 && d.stats.annotatedImages < d.stats.totalImages
  ).length;

  const handleOpenDataset = (dataset: Dataset) => {
    setCurrentDataset(dataset.id);
    // 跳转到数据集详情页
    onViewChange(ViewType.DATASET_DETAIL);
  };

  const handleDeleteDataset = (id: string) => {
    if (confirm('确定要删除这个数据集吗？此操作不可恢复。')) {
      deleteDataset(id);
    }
    setMenuOpenId(null);
  };

  const handleStartTraining = (dataset: Dataset) => {
    if (dataset.stats.annotatedImages === 0) {
      alert('该数据集还没有标注数据，请先完成标注');
      return;
    }
    setTrainingDataset(dataset);
    setMenuOpenId(null);
  };

  const handleImportDefault = async () => {
    // 静默导入，不再需要确认
    setIsImporting(true);
    try {
      const response = await fetch('http://localhost:5002/datasets/import-default', {
        method: 'POST'
      });
      const data = await response.json();

      if (response.ok) {
        console.log(`导入成功！共导入 ${data.message}`);
        // 刷新列表
        await fetchDatasets();
      } else {
        console.error(`导入失败: ${data.error}`);
      }
    } catch (e) {
      console.error('请求失败，请检查服务是否运行');
    } finally {
      setIsImporting(false);
    }
  };

  const handleTrainingSuccess = (taskId: string) => {
    setTrainingDataset(null);
    // 跳转到训练监控页面
    onViewChange(ViewType.MODEL_TRAINING);
  };

  const getStatusBadge = (stats: Dataset['stats']) => {
    if (stats.totalImages === 0) {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">空数据集</span>;
    }
    if (stats.annotatedImages === 0) {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">未开始</span>;
    }
    if (stats.annotatedImages === stats.totalImages) {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">已完成</span>;
    }
    return <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">标注中</span>;
  };

  // 如果选择了音频项目，渲染音频数据集管理组件
  if (currentProject.id === 'audio-anomaly') {
    return (
      <AudioDatasetManagement 
        onViewChange={onViewChange} 
        onProjectChange={(projectId) => {
          const project = PROJECTS.find(p => p.id === projectId);
          if (project) {
            setCurrentProject(project);
          }
        }}
      />
    );
  }

  return (
    <div className="container mx-auto px-10 py-8 max-w-[1440px]">
      {/* Header */}
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
                          onClick={() => {
                            setCurrentProject(project);
                            setShowProjectDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${currentProject.id === project.id
                            ? 'bg-lx-gold/10 text-lx-gold'
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
          <p className="text-lx-textSub text-sm">视觉大师 · {currentProject.description}数据管理</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-lx-gold text-white rounded-lg hover:bg-lx-goldHover transition-colors font-medium"
        >
          <Plus size={18} />
          新建数据集
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <StatCard
          icon={<Database className="w-5 h-5" />}
          label="数据集总数"
          value={totalDatasets}
          color="#cfa972"
        />
        <StatCard
          icon={<ImageIcon className="w-5 h-5" />}
          label="图片总量"
          value={totalImages}
          color="#3b82f6"
        />
        <StatCard
          icon={<CheckCircle className="w-5 h-5" />}
          label="已标注图片"
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

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-xl p-4 mb-6 shadow-sm">
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索数据集名称..."
              value={filter.searchText || ''}
              onChange={(e) => setFilter({ searchText: e.target.value })}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-lx-gold"
            />
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${showFilterPanel ? 'bg-lx-gold text-white border-lx-gold' : 'border-gray-200 hover:border-lx-gold'
              }`}
          >
            <Filter size={16} />
            筛选
          </button>

          {/* Clear Filter */}
          {(filter.partCategory || filter.defectTypes?.length || filter.annotationStatus) && (
            <button
              onClick={clearFilter}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-red-500 transition-colors"
            >
              <X size={14} />
              清除筛选
            </button>
          )}
        </div>

        {/* Filter Panel */}
        {showFilterPanel && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-6">
            {/* Part Category Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">零件类型</label>
              <select
                value={filter.partCategory || ''}
                onChange={(e) => setFilter({ partCategory: e.target.value as PartCategory || undefined })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-lx-gold"
              >
                <option value="">全部零件</option>
                {Object.entries(PART_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Defect Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">缺陷类型</label>
              <select
                value={filter.defectTypes?.[0] || ''}
                onChange={(e) => setFilter({ defectTypes: e.target.value ? [e.target.value as DefectType] : undefined })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-lx-gold"
              >
                <option value="">全部缺陷</option>
                {Object.entries(DEFECT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Annotation Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">标注状态</label>
              <select
                value={filter.annotationStatus || ''}
                onChange={(e) => setFilter({ annotationStatus: e.target.value as AnnotationStatus || undefined })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-lx-gold"
              >
                <option value="">全部状态</option>
                <option value={AnnotationStatus.NOT_STARTED}>未开始</option>
                <option value={AnnotationStatus.IN_PROGRESS}>标注中</option>
                <option value={AnnotationStatus.COMPLETED}>已完成</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Dataset List */}
      <div className="bg-white rounded-xl shadow-sm">
        {isLoading ? (
          // Loading skeleton
          <div className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-16 w-16 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-8 w-24 rounded-lg" />
              </div>
            ))}
          </div>
        ) : filteredDatasets.length === 0 ? (
          <div className="py-20 text-center">
            <Database className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">
              {datasets.length === 0 ? '暂无数据集，点击上方按钮创建' : '没有符合筛选条件的数据集'}
            </p>
            {datasets.length === 0 && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-lx-gold text-white rounded-lg hover:bg-lx-goldHover transition-colors"
              >
                新建数据集
              </button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">数据集</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">零件</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">缺陷类型</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">图片数</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">标注进度</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">状态</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedDatasets.map((dataset) => (
                <tr
                  key={dataset.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => handleOpenDataset(dataset)}
                >
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">{dataset.name}</div>
                      <div className="text-sm text-gray-500 truncate max-w-[200px]">{dataset.description || '暂无描述'}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 text-xs rounded-full bg-gray-100 text-gray-700">
                      {PART_CATEGORY_LABELS[dataset.partCategory]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {dataset.defectTypes.slice(0, 2).map(type => (
                        <span
                          key={type}
                          className="px-2 py-0.5 text-xs rounded-full text-white"
                          style={{ backgroundColor: DEFECT_TYPE_COLORS[type] }}
                        >
                          {DEFECT_TYPE_LABELS[type]}
                        </span>
                      ))}
                      {dataset.defectTypes.length > 2 && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-600">
                          +{dataset.defectTypes.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {dataset.stats.totalImages}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden max-w-[100px]">
                        <div
                          className="h-full bg-lx-gold rounded-full transition-all"
                          style={{ width: `${dataset.stats.completionRate}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-600 w-12">
                        {dataset.stats.completionRate}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(dataset.stats)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setMenuOpenId(menuOpenId === dataset.id ? null : dataset.id)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <MoreVertical size={16} className="text-gray-400" />
                      </button>
                      {menuOpenId === dataset.id && (
                        <div className="absolute right-0 bottom-full mb-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
                          <button
                            onClick={() => {
                              setMenuOpenId(null);
                              handleOpenDataset(dataset);
                            }}
                            className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                          >
                            <FolderOpen size={14} />
                            查看详情
                          </button>
                          <button
                            onClick={() => {
                              setMenuOpenId(null);
                              setCurrentDataset(dataset.id);
                              onViewChange(ViewType.DATA_ANNOTATION);
                            }}
                            className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Tag size={14} />
                            开始标注
                          </button>
                          <button
                            onClick={() => handleStartTraining(dataset)}
                            className="w-full px-4 py-2.5 text-left text-sm hover:bg-gradient-to-r hover:from-blue-50 hover:to-cyan-50 flex items-center gap-2 text-blue-600 font-medium"
                            disabled={dataset.stats.annotatedImages === 0}
                          >
                            <Zap size={14} />
                            训练模型
                          </button>
                          <div className="border-t border-gray-100 my-1"></div>
                          <button
                            onClick={() => handleDeleteDataset(dataset.id)}
                            className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 text-red-500 flex items-center gap-2"
                          >
                            <Trash2 size={14} />
                            删除数据集
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 分页组件 */}
        {!isLoading && paginatedDatasets.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            total={totalDatasetsCount}
            onPageChange={(page) => setCurrentPage(page)}
          />
        )}
      </div>

      {/* Create Dataset Modal */}
      {showCreateModal && (
        <CreateDatasetModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => {
            setShowCreateModal(false);
            setCurrentDataset(id);
          }}
        />
      )}

      {/* Training Config Modal */}
      {trainingDataset && (
        <TrainingConfigModal
          dataset={trainingDataset}
          onClose={() => setTrainingDataset(null)}
          onSuccess={handleTrainingSuccess}
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

// 创建数据集弹窗
const CreateDatasetModal: React.FC<{
  onClose: () => void;
  onCreated: (id: string) => void;
}> = ({ onClose, onCreated }) => {
  const { createDataset } = useDatasetStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [partCategory, setPartCategory] = useState<PartCategory>(PartCategory.DOOR);
  const [partCode, setPartCode] = useState('');
  const [selectedDefects, setSelectedDefects] = useState<DefectType[]>([DefectType.SCRATCH]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('请输入数据集名称');
      return;
    }
    const id = createDataset({
      name: name.trim(),
      description: description.trim(),
      partCategory,
      partCode: partCode.trim() || undefined,
      defectTypes: selectedDefects
    });
    onCreated(id);
  };

  const toggleDefect = (defect: DefectType) => {
    setSelectedDefects(prev =>
      prev.includes(defect)
        ? prev.filter(d => d !== defect)
        : [...prev, defect]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">新建数据集</h2>
          <p className="text-sm text-gray-500 mt-1">创建一个新的外观缺陷数据集</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* 数据集名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              数据集名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：车门外板_划痕_2025Q1"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-lx-gold"
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="数据集描述信息..."
              rows={2}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-lx-gold resize-none"
            />
          </div>

          {/* 零件类型 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              零件类型 <span className="text-red-500">*</span>
            </label>
            <select
              value={partCategory}
              onChange={(e) => setPartCategory(e.target.value as PartCategory)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-lx-gold"
            >
              {Object.entries(PART_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* 零件编码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">零件编码（选填）</label>
            <input
              type="text"
              value={partCode}
              onChange={(e) => setPartCode(e.target.value)}
              placeholder="内部物料号或P/N"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-lx-gold"
            />
          </div>

          {/* 缺陷类型 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              缺陷类型 <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(DEFECT_TYPE_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleDefect(value as DefectType)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${selectedDefects.includes(value as DefectType)
                    ? 'text-white border-transparent'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  style={selectedDefects.includes(value as DefectType) ? {
                    backgroundColor: DEFECT_TYPE_COLORS[value as DefectType]
                  } : {}}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 按钮 */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-lx-gold text-white rounded-lg hover:bg-lx-goldHover transition-colors"
            >
              创建
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
