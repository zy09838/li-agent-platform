import React, { useState, lazy, Suspense } from 'react';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { DatasetDashboard } from './components/DatasetDashboard';
import { DatasetDetail } from './components/DatasetDetail';
import { VisionAgent } from './components/agents/VisionAgent';
import { AudioAgent } from './components/agents/AudioAgent';
import { PlanAgent } from './components/agents/PlanAgent';
import { RiskAgent } from './components/agents/RiskAgent';
import { QualityAgent } from './components/agents/QualityAgent';
import { ViewType, AppMode } from './types';
import { AnimatePresence, motion } from 'framer-motion';

// 懒加载数据标注组件
const DataAnnotationAgent = lazy(() => import('./components/agents/DataAnnotationAgentFixed'));

// 懒加载模型训练组件
const TrainingCenter = lazy(() => import('./components/training/TrainingCenter'));

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>(ViewType.HOME);
  const [appMode, setAppMode] = useState<AppMode>(AppMode.AGENT);

  const renderView = () => {
    switch (currentView) {
      case ViewType.HOME:
        return <Dashboard onViewChange={setCurrentView} />;
      case ViewType.DATASET_HOME:
        return <DatasetDashboard onViewChange={setCurrentView} />;
      case ViewType.DATASET_DETAIL:
        return <DatasetDetail onViewChange={setCurrentView} />;
      case ViewType.VISION:
        return <VisionAgent />;
      case ViewType.AUDIO:
        return <AudioAgent />;
      case ViewType.PLAN:
        return <PlanAgent />;
      case ViewType.RISK:
        return <RiskAgent />;
      case ViewType.QUALITY:
        return <QualityAgent />;
      case ViewType.DATA_ANNOTATION:
        return (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="text-lg">加载中...</div></div>}>
            <DataAnnotationAgent onViewChange={setCurrentView} />
          </Suspense>
        );
      case ViewType.MODEL_TRAINING:
        return (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="text-lg">加载中...</div></div>}>
            <TrainingCenter onViewChange={setCurrentView} />
          </Suspense>
        );
      default:
        return <Dashboard onViewChange={setCurrentView} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col pt-[64px]">
      <Header 
        currentView={currentView} 
        onViewChange={setCurrentView}
        appMode={appMode}
        onModeChange={setAppMode}
      />
      
      <main className="flex-1 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="h-full"
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
