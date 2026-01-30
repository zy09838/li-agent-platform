import React, { useEffect, useRef } from 'react';
import { 
  Activity, Timer, TrendingUp, Target, Crosshair, 
  StopCircle, Terminal, Clock, Cpu, CheckCircle, XCircle, AlertTriangle
} from 'lucide-react';
import { useTrainingStore } from '../../store/useTrainingStore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const TrainingMonitor: React.FC = () => {
  const { 
    trainingStatus, 
    logs, 
    fetchTrainingStatus, 
    fetchLogs, 
    stopTraining 
  } = useTrainingStore();
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  // 定时刷新状态和日志
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTrainingStatus();
      fetchLogs();
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);
  
  // 日志自动滚动
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);
  
  const getStatusConfig = () => {
    switch (trainingStatus.status) {
      case 'preparing':
        return { 
          label: '准备中', 
          color: 'text-blue-600', 
          bgColor: 'bg-blue-50', 
          borderColor: 'border-blue-200',
          icon: Clock
        };
      case 'training':
        return { 
          label: '训练中', 
          color: 'text-amber-600', 
          bgColor: 'bg-amber-50', 
          borderColor: 'border-amber-200',
          icon: Cpu
        };
      case 'completed':
        return { 
          label: '已完成', 
          color: 'text-green-600', 
          bgColor: 'bg-green-50', 
          borderColor: 'border-green-200',
          icon: CheckCircle
        };
      case 'failed':
        return { 
          label: '失败', 
          color: 'text-red-600', 
          bgColor: 'bg-red-50', 
          borderColor: 'border-red-200',
          icon: XCircle
        };
      case 'stopped':
        return { 
          label: '已停止', 
          color: 'text-gray-600', 
          bgColor: 'bg-gray-50', 
          borderColor: 'border-gray-200',
          icon: AlertTriangle
        };
      default:
        return { 
          label: '空闲', 
          color: 'text-gray-500', 
          bgColor: 'bg-gray-50', 
          borderColor: 'border-gray-200',
          icon: Clock
        };
    }
  };
  
  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;
  
  // 计算训练时间
  const getElapsedTime = () => {
    if (!trainingStatus.start_time) return '--:--:--';
    const start = new Date(trainingStatus.start_time);
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000);
    const hours = Math.floor(diff / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const seconds = (diff % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };
  
  // 指标卡片数据 - 根据训练类型动态调整
  const metricCards = trainingStatus.training_type === 'audio' ? [
    {
      label: 'Accuracy',
      value: trainingStatus.metrics?.accuracy?.toFixed(3) || '--',
      icon: Target,
      color: 'from-emerald-500 to-teal-500',
      shadowColor: 'shadow-emerald-200/50'
    },
    {
      label: 'F1 Score',
      value: trainingStatus.metrics?.f1?.toFixed(3) || '--',
      icon: Crosshair,
      color: 'from-blue-500 to-cyan-500',
      shadowColor: 'shadow-blue-200/50'
    },
    {
      label: 'Precision',
      value: trainingStatus.metrics?.precision?.toFixed(3) || '--',
      icon: TrendingUp,
      color: 'from-violet-500 to-purple-500',
      shadowColor: 'shadow-violet-200/50'
    },
    {
      label: 'Recall',
      value: trainingStatus.metrics?.recall?.toFixed(3) || '--',
      icon: Activity,
      color: 'from-amber-500 to-orange-500',
      shadowColor: 'shadow-amber-200/50'
    }
  ] : [
    {
      label: 'mAP@50',
      value: trainingStatus.metrics?.mAP50?.toFixed(3) || '--',
      icon: Target,
      color: 'from-emerald-500 to-teal-500',
      shadowColor: 'shadow-emerald-200/50'
    },
    {
      label: 'mAP@50-95',
      value: trainingStatus.metrics?.['mAP50-95']?.toFixed(3) || '--',
      icon: Crosshair,
      color: 'from-blue-500 to-cyan-500',
      shadowColor: 'shadow-blue-200/50'
    },
    {
      label: 'Precision',
      value: trainingStatus.metrics?.precision?.toFixed(3) || '--',
      icon: TrendingUp,
      color: 'from-violet-500 to-purple-500',
      shadowColor: 'shadow-violet-200/50'
    },
    {
      label: 'Recall',
      value: trainingStatus.metrics?.recall?.toFixed(3) || '--',
      icon: Activity,
      color: 'from-amber-500 to-orange-500',
      shadowColor: 'shadow-amber-200/50'
    }
  ];
  
  // 模拟训练曲线数据（实际应从API获取历史数据）
  const chartData = Array.from({ length: trainingStatus.current_epoch || 1 }, (_, i) => ({
    epoch: i + 1,
    mAP50: Math.min(0.95, 0.3 + (i / (trainingStatus.total_epochs || 100)) * 0.6 + Math.random() * 0.05),
    loss: Math.max(0.02, 0.8 - (i / (trainingStatus.total_epochs || 100)) * 0.6 + Math.random() * 0.05)
  }));
  
  return (
    <div className="space-y-6">
      {/* 状态概览 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* 训练状态卡片 */}
        <div className={`${statusConfig.bgColor} ${statusConfig.borderColor} border rounded-2xl p-5`}>
          <div className="flex items-center justify-between mb-3">
            <span className={`text-sm font-medium ${statusConfig.color}`}>训练状态</span>
            <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
          </div>
          <div className={`text-2xl font-bold ${statusConfig.color}`}>{statusConfig.label}</div>
          {trainingStatus.task_id && (
            <div className="text-xs text-gray-500 mt-1">ID: {trainingStatus.task_id}</div>
          )}
        </div>
        
        {/* 进度 */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-600">训练进度</span>
            <Activity className="w-5 h-5 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{trainingStatus.progress}%</div>
          <div className="w-full h-2 bg-gray-100 rounded-full mt-3 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
              style={{ width: `${trainingStatus.progress}%` }}
            />
          </div>
        </div>
        
        {/* Epoch / 进度 */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-600">
              {trainingStatus.training_type === 'audio' ? '训练阶段' : '当前轮次'}
            </span>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {trainingStatus.training_type === 'audio' ? (
              trainingStatus.status === 'completed' ? '已完成' : '进行中'
            ) : (
              `${trainingStatus.current_epoch} / ${trainingStatus.total_epochs}`
            )}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {trainingStatus.training_type === 'audio' ? 'Status' : 'Epoch'}
          </div>
        </div>
        
        {/* 训练时间 */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-600">运行时间</span>
            <Timer className="w-5 h-5 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900 font-mono">{getElapsedTime()}</div>
          <div className="text-xs text-gray-500 mt-1">已运行时长</div>
        </div>
      </div>
      
      {/* 指标卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map(card => (
          <div key={card.label} className="bg-white rounded-2xl p-5 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-lg ${card.shadowColor}`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-3">{card.value}</div>
            <div className="text-sm text-gray-500">{card.label}</div>
          </div>
        ))}
      </div>
      
      {/* 图表和日志 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 训练曲线 */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-4">训练曲线</h3>
          <div className="h-[300px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="epoch" 
                    stroke="#9ca3af" 
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis 
                    yAxisId="left"
                    stroke="#9ca3af" 
                    fontSize={12}
                    tickLine={false}
                    domain={[0, 1]}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    stroke="#9ca3af" 
                    fontSize={12}
                    tickLine={false}
                    domain={[0, 1]}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '12px', 
                      border: 'none', 
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)' 
                    }}
                  />
                  <Legend />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="mAP50" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    dot={false}
                    name="mAP@50"
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="loss" 
                    stroke="#f59e0b" 
                    strokeWidth={2}
                    dot={false}
                    name="Loss"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <Activity className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>等待训练数据...</p>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* 训练日志 */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-green-400" />
              <span className="font-medium text-white">训练日志</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-gray-400">实时更新</span>
            </div>
          </div>
          
          <div className="h-[260px] overflow-y-auto font-mono text-sm custom-scrollbar">
            {logs.length > 0 ? (
              <div className="space-y-1">
                {logs.map((log, idx) => (
                  <div 
                    key={idx} 
                    className={`flex gap-2 ${
                      log.level === 'error' ? 'text-red-400' :
                      log.level === 'warning' ? 'text-yellow-400' :
                      log.level === 'success' ? 'text-green-400' :
                      'text-gray-300'
                    }`}
                  >
                    <span className="text-gray-500 flex-shrink-0">[{log.timestamp}]</span>
                    <span className="break-all">{log.message}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                <p>等待日志输出...</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* 停止训练按钮 */}
      {trainingStatus.is_training && (
        <div className="flex justify-center">
          <button
            onClick={stopTraining}
            className="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors shadow-lg shadow-red-200/50"
          >
            <StopCircle className="w-5 h-5" />
            停止训练
          </button>
        </div>
      )}
      
      {/* 训练完成提示 */}
      {trainingStatus.status === 'completed' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-green-700 mb-2">训练完成！</h3>
          <p className="text-green-600">模型已保存到模型库，可在"模型管理"页面查看和下载</p>
        </div>
      )}
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #4b5563;
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
};

export default TrainingMonitor;

