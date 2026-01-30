import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, Database, Play, Settings, List, TestTube,
  ArrowLeft, Cpu, Zap, ChevronDown, Layers
} from 'lucide-react';
import { ViewType } from '../../types';
import { useTrainingStore } from '../../store/useTrainingStore';
import TrainingConfig from './TrainingConfig';
import TrainingMonitor from './TrainingMonitor';
import ModelList from './ModelList';
import ModelTest from './ModelTest';

// 项目列表定义
const PROJECTS = [
  { id: 'visual-defect', name: '外观缺陷检测', description: '汽车零部件外观缺陷' },
  { id: 'audio-anomaly', name: '听觉异响检测', description: '音频异常检测' }
];

type TabType = 'config' | 'monitor' | 'models' | 'test';

interface TrainingCenterProps {
  onViewChange: (view: ViewType) => void;
}

const TrainingCenter: React.FC<TrainingCenterProps> = ({ onViewChange }) => {
  const [activeTab, setActiveTab] = useState<TabType>('config');
  const [currentProject, setCurrentProject] = useState(PROJECTS[0]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const { trainingStatus, fetchTrainingStatus, fetchModels, fetchAudioModels, fetchDatasets } = useTrainingStore();
  
  // 初始化数据 - 只在挂载时执行一次
  useEffect(() => {
    fetchModels();
    fetchAudioModels();
    fetchDatasets();
    fetchTrainingStatus();
  }, []);
  
  // 项目切换时刷新对应的模型列表
  useEffect(() => {
    if (currentProject.id === 'visual-defect') {
      fetchModels();
    } else if (currentProject.id === 'audio-anomaly') {
      fetchAudioModels();
    }
  }, [currentProject.id]);
  
  // 训练中时定时刷新状态
  useEffect(() => {
    if (!trainingStatus.is_training) return;
    
    const interval = setInterval(() => {
      fetchTrainingStatus();
    }, 2000);
    
    return () => clearInterval(interval);
  }, [trainingStatus.is_training]);
  
  // 训练开始时自动切换到监控页
  useEffect(() => {
    if (trainingStatus.is_training && activeTab === 'config') {
      setActiveTab('monitor');
    }
  }, [trainingStatus.is_training]);
  
  const tabs = [
    { id: 'config' as TabType, label: '训练配置', icon: Settings },
    { id: 'monitor' as TabType, label: '训练监控', icon: Cpu, badge: trainingStatus.is_training },
    { id: 'models' as TabType, label: '模型管理', icon: List },
    { id: 'test' as TabType, label: '模型测试', icon: TestTube },
  ];
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50/30">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-20">
        <div className="container mx-auto px-6 py-4 max-w-[1600px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => onViewChange(ViewType.HOME)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft size={20} className="text-gray-600" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-200/50">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold text-gray-900">模型训练中心</h1>
                    {/* 项目选择器 */}
                    <div className="relative">
                      <button
                        onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-600 transition-colors"
                      >
                        <Layers size={12} />
                        {currentProject.name}
                        <ChevronDown size={12} className={`transition-transform ${showProjectDropdown ? 'rotate-180' : ''}`} />
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
                                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                                    currentProject.id === project.id 
                                      ? 'bg-amber-50 text-amber-700' 
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
                  <p className="text-sm text-gray-500">{currentProject.description} · 模型训练</p>
                </div>
              </div>
            </div>
            
            {/* 训练状态指示 */}
            {trainingStatus.is_training && (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-full border border-amber-200">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-sm font-medium text-amber-700">
                  {trainingStatus.training_type === 'audio' ? (
                    <>训练中（音频） · {trainingStatus.progress}%</>
                  ) : (
                    <>训练中 · Epoch {trainingStatus.current_epoch}/{trainingStatus.total_epochs}</>
                  )}
                </span>
                <span className="text-sm text-amber-600">
                  {trainingStatus.progress}%
                </span>
              </div>
            )}
          </div>
          
          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all relative ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-200/50'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
                {tab.badge && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="container mx-auto px-6 py-6 max-w-[1600px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'config' && <TrainingConfig onStartTraining={() => setActiveTab('monitor')} projectType={currentProject.id} onViewChange={onViewChange} />}
            {activeTab === 'monitor' && <TrainingMonitor />}
            {activeTab === 'models' && <ModelList onTest={(id) => { setActiveTab('test'); }} projectType={currentProject.id} />}
            {activeTab === 'test' && <ModelTest projectType={currentProject.id} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TrainingCenter;

