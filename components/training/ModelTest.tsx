import React, { useState, useRef, useEffect } from 'react';
import {
  Upload, Play, ImageIcon, Target, AlertCircle,
  RefreshCw, Download, ZoomIn, ZoomOut, Move, Folder, FileText
} from 'lucide-react';
import { useTrainingStore, ModelInfo } from '../../store/useTrainingStore';

interface Detection {
  class: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
}

interface BatchTestResult {
  id: string;
  filename: string;
  detections?: Detection[];
  count?: number;
  status: string;
  error?: string;
  // 音频专用字段
  is_abnormal?: boolean;
  score?: number;
  confidence?: string;
  level?: string;
  test_status?: string;
}

interface ModelTestProps {
  projectType?: string;
}

const ModelTest: React.FC<ModelTestProps> = ({ projectType = 'visual-defect' }) => {
  const { models, audioModels, selectedModelId, selectModel, testModel, fetchModels, fetchAudioModels } = useTrainingStore();

  // 根据项目类型选择显示的模型列表
  const displayModels = projectType === 'audio-anomaly' ? audioModels : models;
  const isAudioProject = projectType === 'audio-anomaly';

  // 单图测试状态
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0.25);
  const [scale, setScale] = useState(1);

  // 批量测试状态
  const [testMode, setTestMode] = useState<'single' | 'batch'>('single');
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchResults, setBatchResults] = useState<BatchTestResult[]>([]);
  const [isBatchTesting, setIsBatchTesting] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (projectType === 'audio-anomaly') {
      fetchAudioModels();
    } else {
      fetchModels();
    }
  }, [projectType]);
  
  // 当图片或检测结果变化时重绘
  useEffect(() => {
    drawDetections();
  }, [imageUrl, detections, scale]);
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setDetections([]);
      setError(null);
      
      // 预览图片
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      
      // 转为base64
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // 移除data:image/xxx;base64,前缀
        const base64 = result.split(',')[1];
        setImageBase64(base64);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const input = fileInputRef.current;
      if (input) {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        handleFileSelect({ target: input } as any);
      }
    }
  };
  
  const handleTest = async () => {
    if (!selectedModelId || !imageBase64) {
      setError('请选择模型和上传图片');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await testModel(selectedModelId, imageBase64, confidence);
      setDetections(result.detections || []);
    } catch (err: any) {
      setError(err.message);
      setDetections([]);
    } finally {
      setIsLoading(false);
    }
  };
  
  const drawDetections = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    
    if (!canvas || !img || !imageUrl) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 等待图片加载
    if (!img.complete) {
      img.onload = () => drawDetections();
      return;
    }
    
    // 设置canvas尺寸
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    
    // 绘制图片
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    // 绘制检测框
    const colors = [
      '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', 
      '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6'
    ];
    
    detections.forEach((det, idx) => {
      const [x1, y1, x2, y2] = det.bbox.map(v => v * scale);
      const color = colors[idx % colors.length];
      
      // 绘制框
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      
      // 绘制标签背景
      const label = `${det.class} ${(det.confidence * 100).toFixed(1)}%`;
      ctx.font = 'bold 14px sans-serif';
      const textWidth = ctx.measureText(label).width;
      
      ctx.fillStyle = color;
      ctx.fillRect(x1, y1 - 24, textWidth + 12, 24);
      
      // 绘制标签文字
      ctx.fillStyle = 'white';
      ctx.fillText(label, x1 + 6, y1 - 7);
    });
  };
  
  const handleReset = () => {
    setImageFile(null);
    setImageUrl(null);
    setImageBase64(null);
    setDetections([]);
    setError(null);
    setScale(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 批量文件选择
  const handleBatchFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      // 根据项目类型过滤文件
      const filtered = isAudioProject
        ? fileArray.filter(f => f.name.endsWith('.wav'))
        : fileArray.filter(f => f.type.startsWith('image/'));

      if (filtered.length !== fileArray.length) {
        alert(`已过滤${fileArray.length - filtered.length}个不支持的文件`);
      }

      setBatchFiles(filtered);
      setBatchResults([]);
      setError(null);
    }
  };

  // 批量测试
  const handleBatchTest = async () => {
    if (!selectedModelId || batchFiles.length === 0) {
      setError('请选择模型并上传文件');
      return;
    }

    // 限制批量数量
    if (batchFiles.length > 50) {
      setError('单次最多支持50个文件，请减少文件数量');
      return;
    }

    // 检查文件大小（警告）
    const totalSize = batchFiles.reduce((sum, file) => sum + file.size, 0);
    const totalSizeMB = totalSize / (1024 * 1024);
    if (totalSizeMB > 50) {
      const confirmed = window.confirm(
        `批量文件总大小为 ${totalSizeMB.toFixed(1)}MB，可能导致上传失败。\n\n建议：\n- 减少文件数量（推荐10-20张）\n- 压缩图片文件\n\n是否继续？`
      );
      if (!confirmed) {
        return;
      }
    }

    setIsBatchTesting(true);
    setError(null);
    setBatchProgress({ current: 0, total: batchFiles.length });
    setBatchResults([]); // 清空之前的结果

    try {
      const results: BatchTestResult[] = [];

      // 逐个处理文件以显示进度
      for (let i = 0; i < batchFiles.length; i++) {
        const file = batchFiles[i];

        // 更新进度
        setBatchProgress({ current: i, total: batchFiles.length });

        try {
          // 读取文件为base64
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1]);
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsDataURL(file);
          });

          if (isAudioProject) {
            // 音频单个检测
            const response = await fetch('http://localhost:5001/api/audio/evaluate/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model_id: selectedModelId,
                audio_files: [{
                  id: `audio_${i}`,
                  filename: file.name,
                  audio: base64
                }]
              })
            });

            const data = await response.json();
            if (data.success && data.results && data.results.length > 0) {
              results.push(data.results[0]);
            } else {
              results.push({
                id: `audio_${i}`,
                filename: file.name,
                is_abnormal: false,
                score: 0,
                status: '检测失败',
                confidence: 'N/A',
                level: 'ERROR',
                test_status: 'error',
                error: data.error || '未知错误'
              });
            }
          } else {
            // 视觉单个检测
            const response = await fetch('http://localhost:5001/evaluate/single', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model_id: selectedModelId,
                image: base64,
                confidence: confidence
              })
            });

            if (response.ok) {
              const data = await response.json();
              results.push({
                id: `image_${i}`,
                filename: file.name,
                detections: data.detections || [],
                count: data.count || 0,
                status: 'success'
              });
            } else {
              const errorData = await response.json().catch(() => ({ error: '服务器错误' }));
              results.push({
                id: `image_${i}`,
                filename: file.name,
                detections: [],
                count: 0,
                status: 'error',
                error: errorData.error || `请求失败: ${response.status}`
              });
            }
          }

          // 实时更新结果显示
          setBatchResults([...results]);

        } catch (fileError: any) {
          // 单个文件处理失败，记录错误继续处理下一个
          results.push({
            id: isAudioProject ? `audio_${i}` : `image_${i}`,
            filename: file.name,
            status: 'error',
            error: fileError.message || '处理失败'
          });
          setBatchResults([...results]);
        }
      }

      // 完成所有文件
      setBatchProgress({ current: batchFiles.length, total: batchFiles.length });

    } catch (err: any) {
      console.error('批量测试错误:', err);
      if (err.message === 'Failed to fetch' || err.name === 'NetworkError') {
        setError('网络连接失败，请检查：\n1. 训练服务器是否运行(端口5001)\n2. 图片文件是否过大\n3. 文件数量是否过多(建议<20张)');
      } else {
        setError(err.message);
      }
    } finally {
      setIsBatchTesting(false);
      setBatchProgress({ current: 0, total: 0 });
    }
  };

  // 清除批量测试
  const handleClearBatch = () => {
    setBatchFiles([]);
    setBatchResults([]);
    setError(null);
    if (batchFileInputRef.current) {
      batchFileInputRef.current.value = '';
    }
  };

  // 导出批量测试结果
  const handleExportResults = () => {
    if (batchResults.length === 0) return;

    const csv = isAudioProject
      ? [
          ['文件名', '是否异常', '异常得分', '状态', '置信度', '级别'],
          ...batchResults.map(r => [
            r.filename,
            r.is_abnormal ? '是' : '否',
            r.score?.toFixed(4) || 'N/A',
            r.status,
            r.confidence || 'N/A',
            r.level || 'N/A'
          ])
        ]
      : [
          ['文件名', '检测数量', '状态'],
          ...batchResults.map(r => [
            r.filename,
            r.count || 0,
            r.status
          ])
        ];

    const csvContent = csv.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `batch_test_results_${Date.now()}.csv`;
    link.click();
  };

  const selectedModel = displayModels.find(m => m.id === selectedModelId);
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 左侧：测试区域 */}
      <div className="lg:col-span-2 space-y-4">
        {/* 模式切换标签 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-2">
          <div className="flex gap-2">
            <button
              onClick={() => setTestMode('single')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                testMode === 'single'
                  ? 'bg-amber-500 text-white shadow-md'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <ImageIcon size={18} />
                <span>单{isAudioProject ? '文件' : '图'}测试</span>
              </div>
            </button>
            <button
              onClick={() => setTestMode('batch')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                testMode === 'batch'
                  ? 'bg-amber-500 text-white shadow-md'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Folder size={18} />
                <span>批量评测</span>
              </div>
            </button>
          </div>
        </div>

        {/* 单图测试模式 */}
        {testMode === 'single' && (
          <>
            {/* 上传区域 / 图片预览 */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {imageUrl ? (
            <div className="relative">
              {/* 工具栏 */}
              <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-lg p-1 shadow-lg">
                <button
                  onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="缩小"
                >
                  <ZoomOut size={18} className="text-gray-600" />
                </button>
                <span className="text-sm text-gray-600 w-16 text-center">{(scale * 100).toFixed(0)}%</span>
                <button
                  onClick={() => setScale(s => Math.min(2, s + 0.25))}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="放大"
                >
                  <ZoomIn size={18} className="text-gray-600" />
                </button>
                <div className="w-px h-6 bg-gray-200" />
                <button
                  onClick={handleReset}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="重置"
                >
                  <RefreshCw size={18} className="text-gray-600" />
                </button>
              </div>
              
              {/* 图片/Canvas */}
              <div className="overflow-auto max-h-[600px] bg-gray-100">
                <div className="min-h-[400px] flex items-center justify-center p-4">
                  {/* 隐藏的原图 */}
                  <img 
                    ref={imageRef}
                    src={imageUrl} 
                    alt="Test" 
                    className="hidden"
                  />
                  {/* 显示的canvas */}
                  <canvas 
                    ref={canvasRef}
                    className="max-w-full shadow-lg rounded-lg"
                  />
                </div>
              </div>
              
              {/* 图片信息 */}
              <div className="p-4 border-t border-gray-100 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ImageIcon size={18} className="text-gray-400" />
                    <span className="text-sm text-gray-600">{imageFile?.name}</span>
                    <span className="text-xs text-gray-400">
                      {imageFile && `${(imageFile.size / 1024).toFixed(1)} KB`}
                    </span>
                  </div>
                  {detections.length > 0 && (
                    <span className="text-sm text-amber-600 font-medium">
                      检测到 {detections.length} 个目标
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <label
              className="flex flex-col items-center justify-center h-[500px] cursor-pointer hover:bg-gray-50 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <Upload className="w-10 h-10 text-gray-400" />
              </div>
              <p className="text-lg font-medium text-gray-700 mb-2">上传测试图片</p>
              <p className="text-sm text-gray-500">点击或拖拽图片到此处</p>
              <p className="text-xs text-gray-400 mt-2">支持 JPG、PNG、BMP 格式</p>
            </label>
          )}
        </div>
        
            {/* 检测结果列表 */}
            {detections.length > 0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-4">检测结果详情</h3>
                <div className="space-y-2">
                  {detections.map((det, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{
                            backgroundColor: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
                              '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6'][idx % 10]
                          }}
                        />
                        <span className="font-medium text-gray-900">{det.class}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-500">
                          置信度: <span className="text-amber-600 font-medium">{(det.confidence * 100).toFixed(1)}%</span>
                        </span>
                        <span className="text-xs text-gray-400 font-mono">
                          [{det.bbox.map(v => v.toFixed(0)).join(', ')}]
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* 批量评测模式 */}
        {testMode === 'batch' && (
          <>
            {/* 批量文件上传区域 */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <label
                className="flex flex-col items-center justify-center h-[300px] cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <input
                  ref={batchFileInputRef}
                  type="file"
                  accept={isAudioProject ? 'audio/wav' : 'image/*'}
                  multiple
                  onChange={handleBatchFileSelect}
                  className="hidden"
                />
                <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                  <Folder className="w-10 h-10 text-gray-400" />
                </div>
                <p className="text-lg font-medium text-gray-700 mb-2">批量上传{isAudioProject ? '音频' : '图片'}文件</p>
                <p className="text-sm text-gray-500">点击选择多个文件</p>
                <p className="text-xs text-gray-400 mt-2">
                  {isAudioProject ? '支持 WAV 格式' : '支持 JPG、PNG、BMP 格式'}
                </p>
              </label>
            </div>

            {/* 批量文件列表 */}
            {batchFiles.length > 0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">已选择文件 ({batchFiles.length})</h3>
                  <button
                    onClick={handleClearBatch}
                    className="text-sm text-red-600 hover:text-red-700 font-medium"
                  >
                    清除全部
                  </button>
                </div>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {batchFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-gray-400" />
                        <span className="text-sm text-gray-700">{file.name}</span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 批量测试结果 */}
            {batchResults.length > 0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">批量测试结果</h3>
                  <button
                    onClick={handleExportResults}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
                  >
                    <Download size={16} />
                    导出CSV
                  </button>
                </div>

                {isAudioProject ? (
                  /* 音频批量结果 */
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {batchResults.map((result, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900">{result.filename}</span>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            result.is_abnormal
                              ? 'bg-red-100 text-red-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {result.is_abnormal ? '异常' : '正常'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className="text-gray-500">得分: </span>
                            <span className="text-gray-900 font-medium">{result.score?.toFixed(4) || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">置信度: </span>
                            <span className="text-gray-900 font-medium">{result.confidence || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">级别: </span>
                            <span className="text-gray-900 font-medium">{result.level || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* 视觉批量结果 */
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {batchResults.map((result, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 rounded-xl">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText size={16} className="text-gray-400" />
                            <span className="text-sm font-medium text-gray-900">{result.filename}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-600">
                              检测数: <span className="text-amber-600 font-medium">{result.count || 0}</span>
                            </span>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              result.status === 'success'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {result.status === 'success' ? '成功' : '失败'}
                            </span>
                          </div>
                        </div>
                        {result.error && (
                          <p className="text-xs text-red-600 mt-2">{result.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      
      {/* 右侧：配置面板 */}
      <div className="space-y-4">
        {/* 模型选择 */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-4">选择{isAudioProject ? '音频' : '视觉'}模型</h3>
          
          {displayModels.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              <Target className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p>暂无可用{isAudioProject ? '音频' : '视觉'}模型</p>
              <p className="text-sm mt-1">请先训练一个模型</p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayModels.filter(m => !m.status || m.status === 'completed').map(model => (
                <button
                  key={model.id}
                  onClick={() => selectModel(model.id)}
                  className={`w-full p-3 rounded-xl text-left transition-all ${
                    selectedModelId === model.id
                      ? 'bg-amber-50 border-2 border-amber-400'
                      : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{model.name}</span>
                    {isAudioProject ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                        异响检测
                      </span>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        model.model_size === 'nano' || model.model_size === 'v8nano'
                          ? 'bg-cyan-100 text-cyan-700' 
                          : 'bg-violet-100 text-violet-700'
                      }`}>
                        {model.model_size === 'nano' || model.model_size === 'v8nano' ? 'v8n' : 'v8m/v11m'}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {isAudioProject ? (
                      <>准确率: {model.metrics?.accuracy ? (model.metrics.accuracy * 100).toFixed(1) + '%' : '--'}</>
                    ) : (
                      <>{model.num_classes} 类别 · mAP@50: {model.metrics?.mAP50?.toFixed(3) || '--'}</>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* 置信度阈值 */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-4">检测参数</h3>
          
          <label className="block">
            <span className="text-sm text-gray-600 mb-2 flex items-center justify-between">
              <span>置信度阈值</span>
              <span className="text-amber-600 font-medium">{confidence}</span>
            </span>
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.05}
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0.1</span>
              <span>0.5</span>
              <span>0.9</span>
            </div>
          </label>
        </div>
        
        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700">检测失败</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          </div>
        )}
        
        {/* 运行检测按钮 */}
        {testMode === 'single' ? (
          <button
            onClick={handleTest}
            disabled={!selectedModelId || !imageBase64 || isLoading}
            className={`w-full py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all ${
              !selectedModelId || !imageBase64 || isLoading
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-200/50 hover:shadow-xl hover:shadow-amber-300/50 hover:-translate-y-0.5'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                检测中...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                运行检测
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleBatchTest}
            disabled={!selectedModelId || batchFiles.length === 0 || isBatchTesting}
            className={`w-full py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all ${
              !selectedModelId || batchFiles.length === 0 || isBatchTesting
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-200/50 hover:shadow-xl hover:shadow-amber-300/50 hover:-translate-y-0.5'
            }`}
          >
            {isBatchTesting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                批量测试中...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                开始批量测试
              </>
            )}
          </button>
        )}

        {/* 批量测试进度条 */}
        {testMode === 'batch' && isBatchTesting && batchProgress.total > 0 && (
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">测试进度</span>
              <span className="text-sm text-gray-600">
                {batchProgress.current} / {batchProgress.total}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-orange-500 h-2.5 rounded-full transition-all duration-300"
                style={{
                  width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%`
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              正在处理第 {batchProgress.current + 1} 个文件...
            </p>
          </div>
        )}

        {/* 当前模型信息 */}
        {selectedModel && (
          <div className="bg-gray-50 rounded-xl p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">当前模型</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">名称</span>
                <span className="text-gray-900">{selectedModel.name}</span>
              </div>
              {isAudioProject ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">类型</span>
                    <span className="text-gray-900">音频异响检测</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">准确率</span>
                    <span className="text-gray-900">
                      {selectedModel.metrics?.accuracy ? (selectedModel.metrics.accuracy * 100).toFixed(1) + '%' : '--'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">架构</span>
                    <span className="text-gray-900">
                      {selectedModel.model_size === 'nano' || selectedModel.model_size === 'v8nano' 
                        ? 'YOLOv8n' 
                        : selectedModel.model_size === 'medium' || selectedModel.model_size === 'v8medium'
                          ? 'YOLOv8m'
                          : selectedModel.model_size}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">类别数</span>
                    <span className="text-gray-900">{selectedModel.num_classes}</span>
                  </div>
                </>
              )}
            </div>
            {!isAudioProject && selectedModel.classes && selectedModel.classes.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-2">支持检测的类别:</p>
                <div className="flex flex-wrap gap-1">
                  {selectedModel.classes.map(cls => (
                    <span 
                      key={cls} 
                      className="px-2 py-0.5 bg-white text-gray-600 text-xs rounded border border-gray-200"
                    >
                      {cls}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelTest;

