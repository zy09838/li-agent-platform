import React from 'react';
import { ViewType, AppMode } from '../types';
import { ArrowLeft, Calendar, Bot, Database, Brain } from 'lucide-react';

interface HeaderProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  appMode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

const VIEW_TITLES: Record<ViewType, string> = {
  [ViewType.HOME]: '智能体平台',
  [ViewType.VISION]: '视觉大师',
  [ViewType.AUDIO]: '听觉大师',
  [ViewType.PLAN]: '计划灵枢',
  [ViewType.RISK]: '风险小灵通',
  [ViewType.QUALITY]: '质量分析师',
  [ViewType.DATA_ANNOTATION]: '数据标注工具',
  [ViewType.DATASET_HOME]: '数据集管理',
  [ViewType.DATASET_DETAIL]: '数据集详情',
  [ViewType.MODEL_TRAINING]: '模型训练中心'
};

export const Header: React.FC<HeaderProps> = ({ currentView, onViewChange, appMode, onModeChange }) => {
  const isHome = currentView === ViewType.HOME || currentView === ViewType.DATASET_HOME || currentView === ViewType.MODEL_TRAINING;

  const handleLogoClick = () => {
    if (appMode === AppMode.AGENT) {
      onViewChange(ViewType.HOME);
    } else if (appMode === AppMode.DATASET) {
      onViewChange(ViewType.DATASET_HOME);
    } else {
      onViewChange(ViewType.MODEL_TRAINING);
    }
  };

  const handleBackClick = () => {
    if (appMode === AppMode.AGENT) {
      onViewChange(ViewType.HOME);
    } else if (appMode === AppMode.DATASET) {
      onViewChange(ViewType.DATASET_HOME);
    } else {
      onViewChange(ViewType.MODEL_TRAINING);
    }
  };

  const handleModeSwitch = (mode: AppMode) => {
    onModeChange(mode);
    if (mode === AppMode.AGENT) {
      onViewChange(ViewType.HOME);
    } else if (mode === AppMode.DATASET) {
      onViewChange(ViewType.DATASET_HOME);
    } else {
      onViewChange(ViewType.MODEL_TRAINING);
    }
  };

  const getTitle = () => {
    if (currentView === ViewType.HOME) return '智能体平台';
    if (currentView === ViewType.DATASET_HOME) return '数据集管理';
    if (currentView === ViewType.MODEL_TRAINING) return '模型训练中心';
    
    const prefix = appMode === AppMode.AGENT ? '智能体' : '工具';
    return (
      <span>
        {prefix}: <span className="font-bold ml-1">{VIEW_TITLES[currentView]}</span>
      </span>
    );
  };

  return (
    <header className="bg-lx-black h-16 flex items-center justify-between px-10 fixed top-0 left-0 right-0 z-50 shadow-lg text-white">
      <div 
        className="flex items-center gap-3.5 cursor-pointer transition-opacity hover:opacity-90"
        onClick={handleLogoClick}
      >
        <div className="bg-white text-lx-black text-lg font-extrabold px-3.5 py-1 rounded-sm tracking-widest leading-tight">
          理链
        </div>
        <div className="text-lx-gold text-xl font-medium tracking-wide">
          {getTitle()}
        </div>
      </div>

      <div className="flex items-center gap-6 text-sm text-white/60">
        {!isHome && (
          <div 
            className="flex items-center gap-1.5 text-lx-gold cursor-pointer font-medium hover:text-white transition-colors"
            onClick={handleBackClick}
          >
            <ArrowLeft size={16} />
            <span>返回总览</span>
          </div>
        )}

        {/* 模式切换按钮 */}
        <div className="flex items-center bg-[#333] rounded-lg p-1">
          <button
            onClick={() => handleModeSwitch(AppMode.AGENT)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
              appMode === AppMode.AGENT 
                ? 'bg-lx-gold text-lx-black' 
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Bot size={14} />
            <span>智能体</span>
          </button>
          <button
            onClick={() => handleModeSwitch(AppMode.TRAINING)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
              appMode === AppMode.TRAINING 
                ? 'bg-lx-gold text-lx-black' 
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Brain size={14} />
            <span>模型训练</span>
          </button>
          <button
            onClick={() => handleModeSwitch(AppMode.DATASET)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
              appMode === AppMode.DATASET 
                ? 'bg-lx-gold text-lx-black' 
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Database size={14} />
            <span>数据集</span>
          </button>
        </div>
        
        <div className="flex items-center gap-2.5">
            <Calendar size={14} />
            <span className="font-mono">{new Date().toISOString().split('T')[0]}</span>
        </div>
        
        <div className="w-8 h-8 bg-[#444] rounded-full flex items-center justify-center border border-lx-gold text-white text-xs font-bold shadow-sm">
          LI
        </div>
      </div>
    </header>
  );
};