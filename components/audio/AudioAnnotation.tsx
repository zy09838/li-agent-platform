import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Play, Pause, Volume2, VolumeX, Save, X, Music,
  Plus, Trash2, Edit2, Clock, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle
} from 'lucide-react';
import {
  AudioFile,
  AudioAnomalyType,
  AudioSeverity,
  TimeSegmentAnnotation,
  AUDIO_ANOMALY_LABELS,
  AUDIO_SEVERITY_LABELS,
  AUDIO_ANOMALY_COLORS
} from '../../types/dataset';
import { v4 as uuidv4 } from 'uuid';

interface AudioAnnotationProps {
  audioFile: AudioFile;
  datasetId: string;
  onSave: (annotation: {
    anomalyType: AudioAnomalyType;
    severity: AudioSeverity;
    notes: string;
    segments?: TimeSegmentAnnotation[];
  }) => Promise<void>;
  onClose: () => void;
}

export const AudioAnnotation: React.FC<AudioAnnotationProps> = ({
  audioFile,
  datasetId,
  onSave,
  onClose
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  // 整体标注数据（向后兼容）
  const [anomalyType, setAnomalyType] = useState<AudioAnomalyType>(
    audioFile.anomalyType || AudioAnomalyType.NORMAL
  );
  const [severity, setSeverity] = useState<AudioSeverity>(
    audioFile.severity || AudioSeverity.NORMAL
  );
  const [notes, setNotes] = useState(audioFile.notes || '');

  // 时间区间标注
  const [segments, setSegments] = useState<TimeSegmentAnnotation[]>(
    audioFile.segments || []
  );
  const [isSelectingSegment, setIsSelectingSegment] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [editingSegment, setEditingSegment] = useState<TimeSegmentAnnotation | null>(null);
  const [showSegmentForm, setShowSegmentForm] = useState(false);
  const [expandedSegments, setExpandedSegments] = useState(true);

  // 新区间的默认值
  const [newSegmentType, setNewSegmentType] = useState<AudioAnomalyType>(AudioAnomalyType.OTHER);
  const [newSegmentSeverity, setNewSegmentSeverity] = useState<AudioSeverity>(AudioSeverity.MEDIUM);
  const [newSegmentNotes, setNewSegmentNotes] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 音频URL
  const audioUrl = `http://localhost:5002${audioFile.url}`;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  // 波形区域点击/拖动选择时间区间
  const handleWaveformMouseDown = (e: React.MouseEvent) => {
    if (!waveformRef.current || duration <= 0) return;
    
    const rect = waveformRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / rect.width) * duration;
    
    setIsSelectingSegment(true);
    setSelectionStart(Math.max(0, Math.min(time, duration)));
    setSelectionEnd(null);
  };

  const handleWaveformMouseMove = useCallback((e: MouseEvent) => {
    if (!isSelectingSegment || !waveformRef.current || duration <= 0) return;
    
    const rect = waveformRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, Math.min((x / rect.width) * duration, duration));
    
    setSelectionEnd(time);
  }, [isSelectingSegment, duration]);

  const handleWaveformMouseUp = useCallback(() => {
    if (isSelectingSegment && selectionStart !== null && selectionEnd !== null) {
      const start = Math.min(selectionStart, selectionEnd);
      const end = Math.max(selectionStart, selectionEnd);
      
      // 只有当选择区间大于0.1秒时才创建
      if (end - start >= 0.1) {
        setShowSegmentForm(true);
        // 保持选择状态以便添加标注
      } else {
        // 太短的选择，跳转播放位置
        if (audioRef.current) {
          audioRef.current.currentTime = start;
          setCurrentTime(start);
        }
        setSelectionStart(null);
        setSelectionEnd(null);
      }
    }
    setIsSelectingSegment(false);
  }, [isSelectingSegment, selectionStart, selectionEnd]);

  useEffect(() => {
    if (isSelectingSegment) {
      window.addEventListener('mousemove', handleWaveformMouseMove);
      window.addEventListener('mouseup', handleWaveformMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleWaveformMouseMove);
      window.removeEventListener('mouseup', handleWaveformMouseUp);
    };
  }, [isSelectingSegment, handleWaveformMouseMove, handleWaveformMouseUp]);

  // 添加新的时间区间标注
  const handleAddSegment = () => {
    if (selectionStart === null || selectionEnd === null) return;
    
    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);
    
    const newSegment: TimeSegmentAnnotation = {
      id: uuidv4(),
      startTime: start,
      endTime: end,
      anomalyType: newSegmentType,
      severity: newSegmentSeverity,
      notes: newSegmentNotes
    };
    
    setSegments(prev => [...prev, newSegment].sort((a, b) => a.startTime - b.startTime));
    
    // 重置选择状态
    setSelectionStart(null);
    setSelectionEnd(null);
    setShowSegmentForm(false);
    setNewSegmentNotes('');
  };

  // 删除时间区间标注
  const handleDeleteSegment = (id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
    if (editingSegment?.id === id) {
      setEditingSegment(null);
    }
  };

  // 更新时间区间标注
  const handleUpdateSegment = (id: string, updates: Partial<TimeSegmentAnnotation>) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  // 播放指定区间
  const playSegment = (segment: TimeSegmentAnnotation) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = segment.startTime;
    audioRef.current.play();
    setIsPlaying(true);
  };

  // 取消选择
  const cancelSelection = () => {
    setSelectionStart(null);
    setSelectionEnd(null);
    setShowSegmentForm(false);
    setNewSegmentNotes('');
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ 
        anomalyType, 
        severity, 
        notes,
        segments: segments.length > 0 ? segments : undefined
      });
      setSaveSuccess(true);
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (error) {
      console.error('Save failed:', error);
      alert('保存失败: ' + (error as Error).message);
      setIsSaving(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  // 计算选择区间的位置
  const getSelectionStyle = () => {
    if (selectionStart === null || duration <= 0) return null;
    
    const start = selectionEnd !== null ? Math.min(selectionStart, selectionEnd) : selectionStart;
    const end = selectionEnd !== null ? Math.max(selectionStart, selectionEnd) : selectionStart;
    
    return {
      left: `${(start / duration) * 100}%`,
      width: `${((end - start) / duration) * 100}%`
    };
  };

  const selectionStyle = getSelectionStyle();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Music className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">音频标注</h2>
              <p className="text-sm text-white/80">{audioFile.filename}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X size={20} className="text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* 音频播放器 */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 space-y-4">
            <audio ref={audioRef} src={audioUrl} />

            {/* 波形区域 - 支持拖动选择 */}
            <div className="relative">
              <div 
                ref={waveformRef}
                className="h-28 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-lg relative overflow-hidden cursor-crosshair select-none"
                onMouseDown={handleWaveformMouseDown}
              >
                {/* 已标注的区间显示 */}
                {segments.map((segment) => (
                  <div
                    key={segment.id}
                    className="absolute top-0 bottom-0 opacity-60 hover:opacity-80 transition-opacity cursor-pointer"
                    style={{
                      left: `${(segment.startTime / duration) * 100}%`,
                      width: `${((segment.endTime - segment.startTime) / duration) * 100}%`,
                      backgroundColor: AUDIO_ANOMALY_COLORS[segment.anomalyType]
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      playSegment(segment);
                    }}
                    title={`${AUDIO_ANOMALY_LABELS[segment.anomalyType]} (${formatTime(segment.startTime)} - ${formatTime(segment.endTime)})`}
                  >
                    <div className="absolute top-1 left-1 text-[10px] text-white font-medium px-1 rounded bg-black/30 whitespace-nowrap">
                      {AUDIO_ANOMALY_LABELS[segment.anomalyType]}
                    </div>
                  </div>
                ))}

                {/* 当前选择区间 */}
                {selectionStyle && (
                  <div
                    className="absolute top-0 bottom-0 bg-indigo-400/50 border-2 border-indigo-500 border-dashed"
                    style={selectionStyle}
                  />
                )}

                {/* 播放进度线 */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                  style={{ left: `${progressPercentage}%` }}
                />

                {/* 波形占位符 */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-gray-400 text-sm">拖动选择时间区间进行标注</span>
                </div>
              </div>
              
              {/* 时间刻度 */}
              <div className="flex justify-between text-xs text-gray-500 mt-1 px-1">
                {duration > 0 && Array.from({ length: 11 }, (_, i) => (
                  <span key={i}>{formatTime((duration / 10) * i)}</span>
                )).filter((_, i) => i % 2 === 0 || duration < 30)}
              </div>
            </div>

            {/* 进度条 */}
            <div className="space-y-2">
              <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-sm text-gray-600">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* 控制按钮 */}
            <div className="flex items-center gap-4">
              <button
                onClick={togglePlay}
                className="w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white hover:shadow-lg transition-all"
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
              </button>

              <button
                onClick={toggleMute}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={handleVolumeChange}
                className="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />

              <div className="ml-auto text-sm text-gray-600">
                {audioFile.sampleRate ? `${(audioFile.sampleRate / 1000).toFixed(1)}kHz` : ''}
              </div>
            </div>
          </div>

          {/* 新区间标注表单 */}
          {showSegmentForm && selectionStart !== null && selectionEnd !== null && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-indigo-900 flex items-center gap-2">
                  <Clock size={16} />
                  新建区间标注
                  <span className="text-sm font-normal text-indigo-600">
                    ({formatTime(Math.min(selectionStart, selectionEnd))} - {formatTime(Math.max(selectionStart, selectionEnd))})
                  </span>
                </h4>
                <button onClick={cancelSelection} className="text-gray-500 hover:text-gray-700">
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">异常类型</label>
                  <select
                    value={newSegmentType}
                    onChange={(e) => setNewSegmentType(e.target.value as AudioAnomalyType)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {Object.entries(AUDIO_ANOMALY_LABELS).filter(([k]) => k !== 'normal').map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">严重程度</label>
                  <select
                    value={newSegmentSeverity}
                    onChange={(e) => setNewSegmentSeverity(e.target.value as AudioSeverity)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {Object.entries(AUDIO_SEVERITY_LABELS).filter(([k]) => k !== 'normal').map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">备注</label>
                <input
                  type="text"
                  value={newSegmentNotes}
                  onChange={(e) => setNewSegmentNotes(e.target.value)}
                  placeholder="描述该区间的具体异响特征..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={cancelSelection}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  取消
                </button>
                <button
                  onClick={handleAddSegment}
                  className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 flex items-center gap-2"
                >
                  <Plus size={16} />
                  添加标注
                </button>
              </div>
            </motion.div>
          )}

          {/* 时间区间标注列表 */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedSegments(!expandedSegments)}
              className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
            >
              <span className="font-medium text-gray-900 flex items-center gap-2">
                <Clock size={18} className="text-indigo-500" />
                时间区间标注
                <span className="text-sm text-gray-500 font-normal">({segments.length} 个区间)</span>
              </span>
              {expandedSegments ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {expandedSegments && (
              <div className="divide-y divide-gray-100">
                {segments.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    <AlertCircle className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p>暂无区间标注</p>
                    <p className="text-sm mt-1">在波形上拖动选择时间区间进行标注</p>
                  </div>
                ) : (
                  segments.map((segment, index) => (
                    <div key={segment.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-4">
                        <div 
                          className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0"
                          style={{ backgroundColor: AUDIO_ANOMALY_COLORS[segment.anomalyType] }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900">
                              {AUDIO_ANOMALY_LABELS[segment.anomalyType]}
                            </span>
                            <span className="text-sm text-gray-500">
                              {AUDIO_SEVERITY_LABELS[segment.severity]}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600">
                            <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                              {formatTime(segment.startTime)}
                            </span>
                            <span className="mx-2">→</span>
                            <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                              {formatTime(segment.endTime)}
                            </span>
                            <span className="text-gray-400 ml-2">
                              ({(segment.endTime - segment.startTime).toFixed(1)}秒)
                            </span>
                          </div>
                          {segment.notes && (
                            <p className="text-sm text-gray-500 mt-1">{segment.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => playSegment(segment)}
                            className="p-1.5 text-gray-500 hover:text-indigo-500 hover:bg-indigo-50 rounded"
                            title="播放此区间"
                          >
                            <Play size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteSegment(segment.id)}
                            className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded"
                            title="删除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 整体标注（折叠） */}
          <details className="border border-gray-200 rounded-xl overflow-hidden">
            <summary className="px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors font-medium text-gray-700">
              整体标注 (可选)
            </summary>
            <div className="p-4 space-y-4">
              {/* 异常类型 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  整体异常类型
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(AUDIO_ANOMALY_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setAnomalyType(key as AudioAnomalyType)}
                      className={`px-4 py-2 rounded-lg border-2 text-sm transition-all ${
                        anomalyType === key
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 严重程度 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  整体严重程度
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(AUDIO_SEVERITY_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setSeverity(key as AudioSeverity)}
                      className={`px-3 py-2 rounded-lg border-2 text-sm transition-all ${
                        severity === key
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 备注 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  整体备注
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="描述音频的整体情况..."
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>
            </div>
          </details>

          {/* 保存成功提示 */}
          {saveSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3"
            >
              <CheckCircle className="text-green-600" size={20} />
              <span className="text-green-700 font-medium">标注已保存</span>
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 flex gap-3 justify-between items-center border-t">
          <div className="text-sm text-gray-500">
            {segments.length > 0 && (
              <span className="text-indigo-600 font-medium">{segments.length} 个区间标注</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || saveSuccess}
              className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save size={16} />
                  保存标注
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
