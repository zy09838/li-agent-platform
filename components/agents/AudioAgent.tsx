import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInferenceStore } from '../../store/useInferenceStore';
import {
  Mic, Upload, Play, Download, CheckCircle,
  XCircle, AlertCircle, Loader2, FileAudio, BarChart3, Database,
  Sliders, Filter, Activity, RefreshCw, Eye, Music,
  X, Sparkles, Send, Volume2, Trash2
} from 'lucide-react';

// API 地址 - 统一使用train_server的代理端点
const AUDIO_API_URL = 'http://localhost:5001';
const MODELS_API_URL = 'http://localhost:5001';

// 模型接口
interface AudioModel {
  id: string;
  name: string;
  type: string;
  created_at: string;
  metrics?: {
    accuracy?: number;
    precision?: number;
    recall?: number;
    f1?: number;
  };
}

// 检测结果接口
interface DetectionResult {
  id: string;
  filename: string;
  is_abnormal: boolean;
  score: number;
  status: string;
  confidence: string;
  level?: string;
  time: string;
  fileUrl?: string;
}

export const AudioAgent = () => {
  const [sensitivity, setSensitivity] = useState(70);
  const [activeTab, setActiveTab] = useState<'realtime' | 'batch' | 'history'>('realtime');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingCount, setAnalyzingCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedResult, setSelectedResult] = useState<DetectionResult | null>(null);
  const [modelOnline, setModelOnline] = useState(false);
  const [deployedModelInfo, setDeployedModelInfo] = useState<any>(null);

  const { audioHistory, addAudioResult, clearAudioHistory, updateAudioThreshold } = useInferenceStore();
  const detections = audioHistory;

  // 上次应用的阈值，用于检测是否改变
  const [lastAppliedThreshold, setLastAppliedThreshold] = useState(70);
  const [isApplyingThreshold, setIsApplyingThreshold] = useState(false);

  // 检查推理服务状态
  useEffect(() => {
    const checkServiceStatus = async () => {
      try {
        const response = await fetch('http://localhost:5005/health');
        const data = await response.json();
        setModelOnline(data.status === 'ok' && data.model_status === 'loaded');

        // 获取部署模型信息
        if (data.status === 'ok') {
          try {
            const infoResponse = await fetch('http://localhost:5005/api/audio/model/info');
            const infoData = await infoResponse.json();
            if (infoData.success) {
              setDeployedModelInfo(infoData.data);
            }
          } catch (e) {
            console.error('Failed to fetch model info:', e);
          }
        }
      } catch (error) {
        console.error('Failed to check service status:', error);
        setModelOnline(false);
      }
    };

    checkServiceStatus();
    const interval = setInterval(checkServiceStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const processFile = async (file: File): Promise<DetectionResult> => {
    const formData = new FormData();
    formData.append('audio', file);

    const response = await fetch(`${AUDIO_API_URL}/api/audio/detect`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (data.success) {
      return {
        id: `AUD_${Date.now().toString().slice(-4)}_${Math.random().toString(36).slice(2, 6)}`,
        filename: file.name,
        is_abnormal: data.data.is_abnormal,
        score: data.data.score,
        status: data.data.status,
        confidence: data.data.confidence,
        level: data.data.level,
        time: new Date().toLocaleTimeString(),
        fileUrl: URL.createObjectURL(file)
      };
    } else {
      throw new Error(data.error || '检测失败');
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!modelOnline) {
      alert('模型服务未就绪，请先在训练中心部署模型');
      return;
    }

    setIsAnalyzing(true);
    setAnalyzingCount(files.length);

    const fileArray = Array.from(files).filter(f => f.name.endsWith('.wav'));
    if (fileArray.length !== files.length) {
      alert(`已过滤 ${files.length - fileArray.length} 个非WAV文件`);
    }

    const results: DetectionResult[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      try {
        const result = await processFile(fileArray[i]);
        results.push(result);
        setAnalyzingCount(fileArray.length - i - 1);
      } catch (e) {
        console.error(`Error processing file ${fileArray[i].name}:`, e);
        results.push({
          id: `ERR_${Date.now()}`,
          filename: fileArray[i].name,
          is_abnormal: false,
          score: 0,
          status: '检测失败',
          confidence: 'N/A',
          time: new Date().toLocaleTimeString()
        });
      }
    }

    // 将结果存入全局 Store
    addAudioResult(results);

    setIsAnalyzing(false);
    setAnalyzingCount(0);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const abnormalCount = detections.filter(d => d.is_abnormal).length;
  const normalCount = detections.filter(d => !d.is_abnormal && d.status !== '检测失败').length;

  // 导出检测结果
  const exportResults = () => {
    if (detections.length === 0) return;

    const csv = [
      ['ID', '文件名', '是否异常', '异常得分', '状态', '置信度', '检测时间'],
      ...detections.map(r => [
        r.id,
        r.filename,
        r.is_abnormal ? '是' : '否',
        r.score.toFixed(4),
        r.status,
        r.confidence,
        r.time
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audio_detection_results_${Date.now()}.csv`;
    link.click();
  };

  // 清除历史记录
  const handleClearHistory = () => {
    if (detections.length === 0) return;

    const confirmed = window.confirm(
      `确定要清除所有历史记录吗？\n\n将删除 ${detections.length} 条检测记录，此操作不可恢复。`
    );

    if (confirmed) {
      clearAudioHistory();
    }
  };

  // 应用新阈值到所有历史记录
  const handleApplyThreshold = () => {
    if (detections.length === 0) {
      alert('暂无历史记录可以应用阈值');
      return;
    }

    setIsApplyingThreshold(true);

    // 使用 setTimeout 让 UI 有时间显示加载状态
    setTimeout(() => {
      updateAudioThreshold(sensitivity);
      setLastAppliedThreshold(sensitivity);
      setIsApplyingThreshold(false);
    }, 100);
  };

  // 处理灵敏度输入框变化
  const handleSensitivityInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // 允许空输入（用户正在编辑）
    if (value === '') {
      return;
    }

    // 转换为数字并验证范围
    const numValue = parseInt(value);
    if (!isNaN(numValue)) {
      // 限制在 0-100 范围内
      const clampedValue = Math.max(0, Math.min(100, numValue));
      setSensitivity(clampedValue);
    }
  };

  // 处理输入框失焦
  const handleSensitivityInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // 如果为空，恢复到当前值
    if (value === '') {
      // 强制更新以恢复显示
      setSensitivity(sensitivity);
    }
  };

  return (
    <div className="pb-20 bg-lx-bgLight min-h-full relative">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".wav"
        multiple
      />

      {/* Module Header */}
      <div className="bg-white pt-8 pb-6 px-10 border-b border-gray-200 shadow-sm z-10 relative">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-lx-black mb-1">听觉大师 (Audio Master)</h1>
            <p className="text-lx-textSub text-sm">NVH异响检测中心 · 基于机器学习的音频异常检测</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleClearHistory}
              disabled={detections.length === 0}
              className="text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title={`清除 ${detections.length} 条历史记录`}
            >
              <Trash2 size={16} /> 清除记录
            </button>
            <button
              onClick={exportResults}
              disabled={detections.length === 0}
              className="text-lx-black bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={16} /> 导出记录
            </button>
            <button
              onClick={handleUploadClick}
              disabled={isAnalyzing || !modelOnline}
              className="bg-lx-black hover:bg-lx-gold text-white px-5 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 font-medium shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {isAnalyzing ? `分析中 (${analyzingCount})...` : '批量上传检测'}
            </button>
          </div>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <MetricCard
            label="今日检测率"
            value={detections.length > 0 ? `${((normalCount / detections.length) * 100).toFixed(1)}%` : '---'}
            trend={detections.length > 0 ? `${detections.length} 个文件` : '暂无数据'}
            trendUp={true}
            icon={<Activity size={18} />}
          />
          <MetricCard
            label="异常检出数"
            value={abnormalCount.toString()}
            trend="Today"
            trendUp={false}
            color="text-lx-error"
            icon={<XCircle size={18} />}
          />
          <MetricCard
            label="模型准确率"
            value={deployedModelInfo?.deploy_info?.metrics?.accuracy
              ? `${(deployedModelInfo.deploy_info.metrics.accuracy * 100).toFixed(1)}%`
              : '---'}
            trend="部署模型"
            trendUp={true}
            icon={<Eye size={18} />}
          />
          <MetricCard
            label="检测耗时 (Avg)"
            value="~2s"
            trend="Stable"
            trendUp={true}
            icon={<RefreshCw size={18} />}
          />
        </div>
      </div>

      {/* Control Bar */}
      <div className="px-10 py-4 bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-16 z-10 flex items-center justify-between">
        <div className="flex items-center gap-8">
          {/* Mode Selection */}
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <TabButton label="实时检测" active={activeTab === 'realtime'} onClick={() => setActiveTab('realtime')} />
            <TabButton label="批量任务" active={activeTab === 'batch'} onClick={() => setActiveTab('batch')} />
            <TabButton label="历史记录" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
          </div>

          <div className="h-6 w-px bg-gray-300"></div>

          {/* 部署模型信息 */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
              <Database size={16} />
              <span>部署模型:</span>
            </div>
            <div className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm">
              {deployedModelInfo?.deploy_info?.model_name || '未部署'}
            </div>
          </div>

          <div className="h-6 w-px bg-gray-300"></div>

          {/* Sensitivity Control */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
              <Sliders size={16} />
              <span>灵敏度:</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-3 w-40">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(parseInt(e.target.value))}
                  className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-lx-gold"
                />
              </div>
              {/* 数字输入框 */}
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={sensitivity}
                  onChange={handleSensitivityInputChange}
                  onBlur={handleSensitivityInputBlur}
                  className="w-16 px-2 py-1 text-xs font-bold text-lx-gold bg-gray-50 border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-lx-gold focus:border-transparent"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
              </div>
              {/* 应用阈值按钮 */}
              {sensitivity !== lastAppliedThreshold && detections.length > 0 && (
                <button
                  onClick={handleApplyThreshold}
                  disabled={isApplyingThreshold}
                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  title="应用新阈值到所有历史记录"
                >
                  {isApplyingThreshold ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>应用中...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={14} />
                      <span>应用阈值</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={`text-xs flex items-center gap-2 px-3 py-1.5 rounded-full border ${modelOnline
            ? 'text-gray-600 bg-green-50 border-green-100'
            : 'text-gray-500 bg-red-50 border-red-100'
          }`}>
          <span className={`w-2 h-2 rounded-full ${modelOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
          {modelOnline ? (
            <>
              <span className="font-medium">Audio Model</span>
              <span className="text-green-600">Online</span>
            </>
          ) : (
            <span className="text-red-600">Model Offline</span>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className={`container mx-auto px-10 py-8 max-w-[1600px] ${selectedResult ? 'pr-[500px]' : ''} transition-all duration-300`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Upload Placeholder */}
          <div
            onClick={handleUploadClick}
            className="bg-white border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center h-[300px] cursor-pointer hover:border-lx-gold hover:bg-lx-gold/5 transition-all group"
          >
            <div className="p-4 bg-gray-50 rounded-full mb-3 group-hover:bg-white transition-colors">
              <Upload size={24} className="text-gray-400 group-hover:text-lx-gold" />
            </div>
            <span className="text-sm font-medium text-gray-500 group-hover:text-lx-gold">点击或拖拽上传音频</span>
            <span className="text-xs text-gray-400 mt-1">支持多选 · 仅 WAV 格式</span>
          </div>

          {/* Render Detection Cards */}
          {detections.map((item) => (
            <AudioDetectionCard
              key={item.id}
              {...item}
              onCardClick={() => setSelectedResult(item)}
              isSelected={selectedResult?.id === item.id}
            />
          ))}
        </div>
      </div>

      {/* Analysis Sidebar */}
      <AnimatePresence>
        {selectedResult && (
          <AudioAnalysisSidebar
            item={selectedResult}
            onClose={() => setSelectedResult(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// 指标卡片组件
const MetricCard = ({ label, value, trend, trendUp, icon, color = "text-lx-black" }: any) => (
  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col justify-between h-28">
    <div className="flex justify-between items-start">
      <span className="text-xs text-gray-500 font-medium">{label}</span>
      <span className="text-gray-400">{icon}</span>
    </div>
    <div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className={`text-xs mt-1 font-medium ${trendUp ? 'text-lx-success' : 'text-lx-textSub'}`}>
        {trend}
      </div>
    </div>
  </div>
);

// Tab 按钮组件
const TabButton = ({ label, active, onClick }: { label: string, active?: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${active
        ? 'bg-white text-lx-black shadow-sm ring-1 ring-black/5'
        : 'text-gray-500 hover:text-gray-900'
      }`}
  >
    {label}
  </button>
);

// 音频检测卡片组件
const AudioDetectionCard = ({
  id, filename, is_abnormal, score, status, confidence, time, fileUrl,
  onCardClick, isSelected
}: DetectionResult & { onCardClick?: () => void; isSelected?: boolean }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div
      onClick={onCardClick}
      className={`bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all cursor-pointer group border-2 ${isSelected ? 'border-lx-gold ring-2 ring-lx-gold/20' : 'border-transparent'
        }`}
    >
      {/* 音频可视化区域 */}
      <div className="relative h-[200px] bg-gradient-to-br from-indigo-50 to-purple-50 overflow-hidden flex items-center justify-center">
        {/* 波形动画背景 */}
        <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-30">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className={`w-1 bg-indigo-400 rounded-full transition-all duration-300 ${isPlaying ? 'animate-pulse' : ''}`}
              style={{
                height: `${Math.random() * 60 + 20}%`,
                animationDelay: `${i * 0.05}s`
              }}
            />
          ))}
        </div>

        {/* 中心播放按钮 */}
        <button
          onClick={handlePlayPause}
          className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center transition-all ${is_abnormal
              ? 'bg-gradient-to-br from-red-500 to-orange-500 shadow-lg shadow-red-200/50'
              : 'bg-gradient-to-br from-green-500 to-emerald-500 shadow-lg shadow-green-200/50'
            }`}
        >
          {isPlaying ? (
            <Volume2 size={28} className="text-white animate-pulse" />
          ) : (
            <Mic size={28} className="text-white" />
          )}
        </button>

        {fileUrl && (
          <audio
            ref={audioRef}
            src={fileUrl}
            onEnded={() => setIsPlaying(false)}
          />
        )}

        {/* AI分析图标 */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white p-2 rounded-lg backdrop-blur-sm shadow-lg flex items-center gap-1.5">
            <Sparkles size={14} />
            <span className="text-xs font-medium">AI分析</span>
          </button>
        </div>

        {/* 状态角标 */}
        <div className={`absolute bottom-2 right-2 text-white text-[10px] px-2 py-0.5 rounded-full font-bold ${status === '检测失败' ? 'bg-gray-500' : is_abnormal ? 'bg-red-500' : 'bg-green-500'
          }`}>
          {status === '检测失败' ? '检测失败' : is_abnormal ? '异常检出' : '正常'}
        </div>
      </div>

      <div className="p-3">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-bold text-lx-black text-sm truncate max-w-[150px]" title={filename}>
              {filename}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
              <span>Manual Upload</span>
              <span className="w-0.5 h-2 bg-gray-300"></span>
              <span>{time}</span>
            </div>
          </div>
          {status === '检测失败' ? (
            <div className="text-gray-500 text-xs font-bold flex items-center gap-1">
              <XCircle size={12} /> 失败
            </div>
          ) : is_abnormal ? (
            <div className="text-right">
              <div className="text-lx-error text-xs font-bold flex items-center justify-end gap-1">
                <AlertCircle size={12} /> 异常
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">Score: {score.toFixed(3)}</div>
            </div>
          ) : (
            <div className="text-lx-success text-xs font-bold flex items-center gap-1">
              <CheckCircle size={12} /> 正常
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// 音频分析侧边栏组件
const AudioAnalysisSidebar = ({ item, onClose }: { item: DetectionResult; onClose: () => void }) => {
  const [customQuery, setCustomQuery] = useState('');

  return (
    <motion.div
      initial={{ x: 480 }}
      animate={{ x: 0 }}
      exit={{ x: 480 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">音频分析报告</h2>
            <p className="text-sm text-white/80">AI 异响检测结果</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/20 rounded-lg transition-colors"
        >
          <X size={20} className="text-white" />
        </button>
      </div>

      {/* Audio Info */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${item.is_abnormal
              ? 'bg-gradient-to-br from-red-100 to-orange-100'
              : 'bg-gradient-to-br from-green-100 to-emerald-100'
            }`}>
            <Mic size={32} className={item.is_abnormal ? 'text-red-500' : 'text-green-500'} />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-gray-900 truncate">{item.filename}</div>
            <div className="text-sm text-gray-500 mt-1">检测时间: {item.time}</div>
            <div className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs font-bold ${item.is_abnormal
                ? 'bg-red-100 text-red-700'
                : 'bg-green-100 text-green-700'
              }`}>
              {item.is_abnormal ? <AlertCircle size={12} /> : <CheckCircle size={12} />}
              {item.is_abnormal ? '检测到异常' : '检测正常'}
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-4">
          {/* 检测结果详情 */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <h3 className="font-semibold text-gray-900">检测结果详情</h3>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-white rounded-lg p-3">
                <div className="text-gray-500 mb-1">状态</div>
                <div className={`font-bold ${item.status === '检测失败' ? 'text-gray-600' :
                    item.is_abnormal ? 'text-red-600' : 'text-green-600'
                  }`}>
                  {item.status}
                </div>
              </div>
              <div className="bg-white rounded-lg p-3">
                <div className="text-gray-500 mb-1">异常得分</div>
                <div className="font-bold text-gray-900">{item.score.toFixed(4)}</div>
              </div>
              <div className="bg-white rounded-lg p-3">
                <div className="text-gray-500 mb-1">置信度</div>
                <div className="font-bold text-gray-900">{item.confidence}</div>
              </div>
              <div className="bg-white rounded-lg p-3">
                <div className="text-gray-500 mb-1">判定结果</div>
                <div className={`font-bold ${item.is_abnormal ? 'text-red-600' : 'text-green-600'}`}>
                  {item.is_abnormal ? '异常' : '正常'}
                </div>
              </div>
            </div>
          </div>

          {/* 分析说明 */}
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <h3 className="font-semibold text-gray-900">AI 分析说明</h3>
            </div>
            <div className="prose prose-sm max-w-none text-gray-700">
              {item.is_abnormal ? (
                <p>
                  该音频样本被检测为<strong className="text-red-600">异常</strong>。
                  异常得分为 {item.score.toFixed(4)}，表明音频中存在与正常模式显著不同的特征。
                  建议进行人工复核，确认是否存在设备异响或其他异常情况。
                </p>
              ) : (
                <p>
                  该音频样本被检测为<strong className="text-green-600">正常</strong>。
                  音频特征与训练数据中的正常模式高度匹配，未检测到明显异常。
                </p>
              )}
            </div>
          </div>

          {/* 建议措施 */}
          {item.is_abnormal && (
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <h3 className="font-semibold text-amber-900">建议措施</h3>
              </div>
              <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                <li>安排技术人员进行现场检查</li>
                <li>对比历史正常音频，确认差异</li>
                <li>如确认异常，记录并上报维护团队</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Custom Query Input */}
      <div className="border-t border-gray-200 p-4 bg-gray-50">
        <div className="flex gap-2">
          <input
            type="text"
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder="输入问题进行进一步分析..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          />
          <button
            disabled={!customQuery.trim()}
            className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          💡 尝试问: "这个异响可能是什么原因？" "如何排查此类问题？"
        </p>
      </div>
    </motion.div>
  );
};

export default AudioAgent;
