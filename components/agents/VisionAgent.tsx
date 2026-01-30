import React, { useState, useRef, useEffect } from 'react';
import { Camera, CheckCircle, XCircle, Upload, Sliders, Eye, Activity, Filter, RefreshCw, ScanLine, Loader2, Images, X, ZoomIn, MessageSquare, Send, Sparkles, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { analyzeImage, PartType as GeminiPartType } from '../../services/gemini';
import { motion, AnimatePresence } from 'framer-motion';
import { useInferenceStore } from '../../store/useInferenceStore';

// YOLO API 地址
const YOLO_API_URL = import.meta.env.VITE_YOLO_API_URL || 'http://localhost:5000';
// LLM分析API地址
const LLM_API_URL = 'http://localhost:5004';

// 零件类型配置
const PART_TYPES = [
    { id: 'paint', name: '漆面', description: '车身漆面缺陷检测' },
    { id: 'electric_drive', name: '电驱动总成', description: '电驱动总成外观检测' },
    { id: 'glass', name: '玻璃', description: '车窗玻璃缺陷检测' },
] as const;

type PartType = typeof PART_TYPES[number]['id'];

interface Detection {
    class: string;
    confidence: number;
    bbox: [number, number, number, number]; // [x1, y1, x2, y2]
}

interface ModelInfo {
    status: string;
    model: string;
    version: string;
    deployed_at?: string;
    part_type?: PartType;
    metrics?: {
        mAP50?: number;
        precision?: number;
        recall?: number;
    };
}

// 各零件类型的模型信息
interface PartModelInfo {
    [key: string]: ModelInfo | null;
}

interface InspectionItem {
    id: string;
    line: string;
    time: string;
    imgUrl: string;
    status: 'PASS' | 'NG';
    issue?: string;
    confidence?: string;
    detections?: Detection[];
    imageWidth?: number;
    imageHeight?: number;
}

interface LLMAnalysisResult {
    analysis: string;
    metadata?: {
        usage?: {
            total_tokens?: number;
            prompt_tokens?: number;
            completion_tokens?: number;
        };
    };
    timestamp?: string;
}

// 全屏图片预览组件
const ImageViewerModal = ({ isOpen, onClose, item }: { isOpen: boolean; onClose: () => void; item: InspectionItem | null }) => {
    if (!isOpen || !item) return null;

    const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
    const imgRef = useRef<HTMLImageElement>(null);

    // 更新图片实际显示尺寸，用于绘制检测框
    useEffect(() => {
        const updateSize = () => {
            if (imgRef.current) {
                const { width, height } = imgRef.current.getBoundingClientRect();
                setImgSize({ width, height });
            }
        };

        window.addEventListener('resize', updateSize);
        // 初始加载延迟检测
        setTimeout(updateSize, 100);
        return () => window.removeEventListener('resize', updateSize);
    }, [item]);

    const renderDetections = () => {
        if (!item.detections || item.detections.length === 0 || !item.imageWidth || !item.imageHeight || imgSize.width === 0) return null;

        const scaleX = imgSize.width / item.imageWidth;
        const scaleY = imgSize.height / item.imageHeight;

        return item.detections.map((det, idx) => {
            const [x1, y1, x2, y2] = det.bbox;
            const left = x1 * scaleX;
            const top = y1 * scaleY;
            const width = (x2 - x1) * scaleX;
            const height = (y2 - y1) * scaleY;

            return (
                <div
                    key={idx}
                    className="absolute border-2 border-red-500 bg-red-500/20 group"
                    style={{
                        left: `${left}px`,
                        top: `${top}px`,
                        width: `${width}px`,
                        height: `${height}px`,
                    }}
                >
                    <div className="absolute -top-6 left-0 bg-red-500 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        {det.class} ({(det.confidence * 100).toFixed(0)}%)
                    </div>
                </div>
            );
        });
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white p-2">
                <X size={32} />
            </button>

            <div
                className="relative max-w-[90vw] max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                <img
                    ref={imgRef}
                    src={item.imgUrl}
                    alt={item.id}
                    className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                    onLoad={() => {
                        if (imgRef.current) {
                            const { width, height } = imgRef.current.getBoundingClientRect();
                            setImgSize({ width, height });
                        }
                    }}
                />
                {renderDetections()}
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md px-6 py-3 rounded-full text-white flex gap-6">
                <div>
                    <span className="text-gray-400 text-xs block">ID</span>
                    <span className="font-mono text-sm">{item.id}</span>
                </div>
                <div>
                    <span className="text-gray-400 text-xs block">Status</span>
                    <span className={`text-sm font-bold ${item.status === 'NG' ? 'text-red-400' : 'text-green-400'}`}>
                        {item.status}
                    </span>
                </div>
                {item.issue && (
                    <div>
                        <span className="text-gray-400 text-xs block">Defect</span>
                        <span className="text-sm text-red-400 font-bold">{item.issue}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// 缺陷明细弹窗
const DefectListModal = ({ isOpen, onClose, items, onViewImage }: { isOpen: boolean; onClose: () => void; items: InspectionItem[]; onViewImage: (item: InspectionItem) => void }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
            >
                <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <XCircle className="text-red-500" size={20} />
                        <h3 className="font-bold text-gray-800">缺陷明细列表 ({items.length})</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-red-100 rounded-lg text-gray-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="overflow-y-auto p-4 space-y-3">
                    {items.length === 0 ? (
                        <div className="text-center py-10 text-gray-400">
                            暂无缺陷记录
                        </div>
                    ) : (
                        items.map(item => (
                            <div key={item.id} className="flex gap-4 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                                <div
                                    className="w-20 h-20 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0 cursor-pointer relative group"
                                    onClick={() => onViewImage(item)}
                                >
                                    <img src={item.imgUrl} alt={item.id} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                        <ZoomIn className="text-white opacity-0 group-hover:opacity-100" size={20} />
                                    </div>
                                </div>
                                <div className="flex-1 flex flex-col justify-center">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-bold text-gray-800">{item.id.startsWith('UPL') ? 'Manual_Upload' : item.id}</div>
                                            <div className="text-xs text-gray-500 mt-1">{item.time} · {item.line}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-red-600 font-bold bg-red-50 px-2 py-1 rounded text-xs">
                                                {item.issue || 'Unknown Defect'}
                                            </div>
                                            <div className="text-xs text-gray-400 mt-1">置信度: {item.confidence}</div>
                                        </div>
                                    </div>
                                    {item.detections && item.detections.length > 0 && (
                                        <div className="mt-2 flex gap-2">
                                            {item.detections.map((d, i) => (
                                                <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                                    {d.class} ({(d.confidence * 100).toFixed(0)}%)
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </motion.div>
        </div>
    );
};

// 各零件类型独立的检测数据
interface PartInspections {
    [key: string]: InspectionItem[];
}

export const VisionAgent = () => {
    const [sensitivity, setSensitivity] = useState(25);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzingCount, setAnalyzingCount] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedImage, setSelectedImage] = useState<InspectionItem | null>(null);
    const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
    const [modelOnline, setModelOnline] = useState(false);

    // 零件类型选择
    const [selectedPartType, setSelectedPartType] = useState<PartType>('paint');
    const [partModels, setPartModels] = useState<PartModelInfo>({});

    // 从全局 Store 获取检测数据
    const { visionHistory, addVisionResult, clearVisionHistory } = useInferenceStore();
    const partInspections = visionHistory;

    // 当前零件类型的检测数据
    const inspections = partInspections[selectedPartType] || [];

    // 缺陷列表弹窗状态
    const [isDefectListOpen, setIsDefectListOpen] = useState(false);

    // 图片全屏预览状态
    const [viewingImage, setViewingImage] = useState<InspectionItem | null>(null);

    // 获取各零件类型的模型信息
    useEffect(() => {
        const fetchAllPartModels = async () => {
            const newPartModels: PartModelInfo = {};

            for (const partType of PART_TYPES) {
                try {
                    const response = await fetch(`${YOLO_API_URL}/health?part_type=${partType.id}`);
                    if (response.ok) {
                        const data = await response.json();
                        newPartModels[partType.id] = { ...data, part_type: partType.id };
                    } else {
                        newPartModels[partType.id] = null;
                    }
                } catch (error) {
                    console.error(`Failed to fetch model info for ${partType.id}:`, error);
                    newPartModels[partType.id] = null;
                }
            }

            setPartModels(newPartModels);
            // 设置当前选中零件类型的模型信息
            const currentModel = newPartModels[selectedPartType];
            setModelInfo(currentModel);
            setModelOnline(!!currentModel);
        };

        fetchAllPartModels();
        // 每30秒检查一次模型状态
        const interval = setInterval(fetchAllPartModels, 30000);
        return () => clearInterval(interval);
    }, []);

    // 切换零件类型时更新模型信息和清空选中的图片
    useEffect(() => {
        const currentModel = partModels[selectedPartType];
        setModelInfo(currentModel || null);
        setModelOnline(!!currentModel);
        setSelectedImage(null); // 切换时清空选中
    }, [selectedPartType, partModels]);

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const processFile = async (file: File, partType: PartType, confidenceThreshold: number): Promise<InspectionItem> => {
        const objectUrl = URL.createObjectURL(file);

        // 获取图片尺寸
        const img = new Image();
        await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.src = objectUrl;
        });

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64String = (reader.result as string).split(',')[1];

                try {
                    // 传递零件类型和置信度阈值
                    const result = await analyzeImage(
                        base64String,
                        partType as GeminiPartType,
                        confidenceThreshold / 100  // 转换为0-1范围
                    );

                    resolve({
                        id: `UPL_${Date.now().toString().slice(-4)}_${Math.random().toString(36).slice(2, 6)}`,
                        line: "Manual Upload",
                        time: new Date().toLocaleTimeString(),
                        imgUrl: objectUrl,
                        status: result.status as 'PASS' | 'NG',
                        issue: result.status === 'NG' ? result.issue : undefined,
                        confidence: result.confidence,
                        detections: result.detections || [],
                        imageWidth: img.naturalWidth,
                        imageHeight: img.naturalHeight
                    });
                } catch (e) {
                    reject(e);
                }
            };
            reader.readAsDataURL(file);
        });
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        setIsAnalyzing(true);
        setAnalyzingCount(files.length);

        const fileArray = Array.from(files);
        const results: InspectionItem[] = [];

        // 保存当前的零件类型和阈值，避免在处理过程中被更改
        const currentPartType = selectedPartType;
        const currentSensitivity = sensitivity;

        for (let i = 0; i < fileArray.length; i++) {
            try {
                const result = await processFile(fileArray[i], currentPartType, currentSensitivity);
                results.push(result);
                setAnalyzingCount(files.length - i - 1);
            } catch (e) {
                console.error(`Error processing file ${fileArray[i].name}:`, e);
            }
        }

        // 将结果存入全局 Store
        addVisionResult(currentPartType, results);

        setIsAnalyzing(false);
        setAnalyzingCount(0);

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const ngCount = inspections.filter(i => i.status === 'NG').length;

    // 清除历史记录
    const handleClearHistory = () => {
        if (inspections.length === 0) return;

        const confirmed = window.confirm(
            `确定要清除${PART_TYPES.find(p => p.id === selectedPartType)?.name}的历史记录吗？\n\n将删除 ${inspections.length} 条检测记录，此操作不可恢复。`
        );

        if (confirmed) {
            clearVisionHistory(selectedPartType);
        }
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
                accept="image/*"
                multiple
            />

            {/* Module Header */}
            <div className="bg-white pt-8 pb-6 px-10 border-b border-gray-200 shadow-sm z-10 relative">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-2xl font-bold text-lx-black">视觉大师 (Vision Master)</h1>
                            <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
                                {PART_TYPES.find(p => p.id === selectedPartType)?.name}
                            </span>
                        </div>
                        <p className="text-lx-textSub text-sm">
                            {PART_TYPES.find(p => p.id === selectedPartType)?.description} · 基于 YOLOv8 + 大模型深度分析
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleClearHistory}
                            disabled={inspections.length === 0}
                            className="text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={`清除 ${inspections.length} 条历史记录`}
                        >
                            <Trash2 size={16} /> 清除记录
                        </button>
                        <button className="text-lx-black bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                            <Filter size={16} /> 历史记录
                        </button>
                        <button
                            onClick={handleUploadClick}
                            disabled={isAnalyzing || !modelOnline}
                            className="bg-lx-black hover:bg-lx-gold text-white px-5 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 font-medium shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                            title={!modelOnline ? '请先部署模型' : ''}
                        >
                            {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Images size={16} />}
                            {isAnalyzing ? `分析中 (${analyzingCount})...` : '批量上传检测'}
                        </button>
                    </div>
                </div>

                {/* Key Metrics Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <MetricCard
                        label="今日直通率 (FTQ)"
                        value={inspections.length > 0 ? `${((inspections.length - ngCount) / inspections.length * 100).toFixed(1)}%` : '---'}
                        trend={inspections.length > 0 ? `${inspections.length} 张` : '暂无数据'}
                        trendUp={true}
                        icon={<Activity size={18} />}
                    />
                    <MetricCard
                        label="缺陷检出数"
                        value={ngCount.toString()}
                        trend="点击查看明细"
                        trendUp={false}
                        color="text-lx-error"
                        icon={<XCircle size={18} />}
                        onClick={() => setIsDefectListOpen(true)}
                        isClickable
                    />
                    <MetricCard
                        label="误报率 (False Positive)"
                        value="0.05%"
                        trend="-0.01%"
                        trendUp={true}
                        icon={<Eye size={18} />}
                    />
                    <MetricCard
                        label="检测耗时 (Avg)"
                        value="120ms"
                        trend="Stable"
                        trendUp={true}
                        icon={<RefreshCw size={18} />}
                    />
                </div>
            </div>

            {/* Part Type Tabs */}
            <div className="px-10 py-4 bg-gray-50 border-b border-gray-200">
                <div className="flex gap-4">
                    {PART_TYPES.map(pt => {
                        const ptInspections = partInspections[pt.id] || [];
                        const ptNgCount = ptInspections.filter(i => i.status === 'NG').length;
                        const ptModel = partModels[pt.id];
                        const isSelected = selectedPartType === pt.id;

                        return (
                            <button
                                key={pt.id}
                                onClick={() => setSelectedPartType(pt.id)}
                                className={`flex-1 p-4 rounded-xl transition-all ${isSelected
                                    ? 'bg-white shadow-md ring-2 ring-amber-400'
                                    : 'bg-white/60 hover:bg-white hover:shadow-sm'
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className={`font-bold ${isSelected ? 'text-amber-600' : 'text-gray-700'}`}>
                                        {pt.name}
                                    </span>
                                    <span className={`w-2 h-2 rounded-full ${ptModel ? 'bg-green-500' : 'bg-gray-300'}`}
                                        title={ptModel ? '模型已部署' : '未部署模型'} />
                                </div>
                                <div className="flex items-center gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-500">检测: </span>
                                        <span className="font-semibold text-gray-900">{ptInspections.length}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">缺陷: </span>
                                        <span className={`font-semibold ${ptNgCount > 0 ? 'text-red-500' : 'text-gray-900'}`}>
                                            {ptNgCount}
                                        </span>
                                    </div>
                                    {ptInspections.length > 0 && (
                                        <div>
                                            <span className="text-gray-500">直通率: </span>
                                            <span className="font-semibold text-green-600">
                                                {((ptInspections.length - ptNgCount) / ptInspections.length * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Control Bar */}
            <div className="px-10 py-4 bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-16 z-10 flex items-center justify-between">
                <div className="flex items-center gap-8">
                    {/* Sensitivity Control */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                            <Sliders size={16} />
                            <span>AI 阈值:</span>
                        </div>
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
                    </div>
                </div>

                <div className={`text-xs flex items-center gap-2 px-3 py-1.5 rounded-full border ${modelOnline
                    ? 'text-gray-600 bg-green-50 border-green-100'
                    : 'text-gray-500 bg-amber-50 border-amber-100'
                    }`}>
                    <span className={`w-2 h-2 rounded-full ${modelOnline ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></span>
                    {modelOnline ? (
                        <>
                            <span className="font-medium text-gray-500">
                                [{PART_TYPES.find(p => p.id === selectedPartType)?.name}]
                            </span>
                            <span className="font-medium">
                                {/* 检查是否为视觉模型 - 如果模型名包含"音频"或"audio"，显示为错误配置 */}
                                {modelInfo?.model?.includes('音频') || modelInfo?.model?.toLowerCase().includes('audio')
                                    ? '⚠️ 模型配置错误'
                                    : modelInfo?.model || 'YOLO 视觉检测'}
                            </span>
                            {modelInfo?.version && modelInfo.version !== 'default' && !modelInfo?.model?.includes('音频') && (
                                <span className="text-gray-400">v{modelInfo.version}</span>
                            )}
                            <span className="text-green-600">Online</span>
                        </>
                    ) : (
                        <>
                            <span className="font-medium text-gray-500">
                                [{PART_TYPES.find(p => p.id === selectedPartType)?.name}]
                            </span>
                            <span className="text-amber-600">未部署模型</span>
                        </>
                    )}
                </div>
            </div>

            {/* Main Content Grid */}
            <div className={`container mx-auto px-10 py-8 max-w-[1600px] ${selectedImage ? 'pr-[500px]' : ''} transition-all duration-300`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

                    {/* Upload Placeholder */}
                    <div
                        onClick={handleUploadClick}
                        className="bg-white border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center h-[300px] cursor-pointer hover:border-lx-gold hover:bg-lx-gold/5 transition-all group"
                    >
                        <div className="p-4 bg-gray-50 rounded-full mb-3 group-hover:bg-white transition-colors">
                            <Upload size={24} className="text-gray-400 group-hover:text-lx-gold" />
                        </div>
                        <span className="text-sm font-medium text-gray-500 group-hover:text-lx-gold">点击或拖拽上传图片</span>
                        <span className="text-xs text-gray-400 mt-1">支持多选 · JPG, PNG, BMP</span>
                    </div>

                    {/* Render Inspection Cards */}
                    {inspections.map((item) => (
                        <InspectionCard
                            key={item.id}
                            {...item}
                            // 点击图片本身查看大图
                            onImageClick={() => setViewingImage(item)}
                            // 点击右上角AI分析按钮
                            onAnalyzeClick={() => setSelectedImage(item)}
                            // 点击卡片底部区域
                            onClick={() => setSelectedImage(item)}
                            isSelected={selectedImage?.id === item.id}
                        />
                    ))}

                </div>
            </div>

            {/* LLM Analysis Sidebar */}
            {selectedImage && (
                <LLMAnalysisSidebar
                    item={selectedImage}
                    onClose={() => setSelectedImage(null)}
                />
            )}

            {/* 缺陷列表弹窗 */}
            <DefectListModal
                isOpen={isDefectListOpen}
                onClose={() => setIsDefectListOpen(false)}
                items={inspections.filter(i => i.status === 'NG')}
                onViewImage={(item) => setViewingImage(item)}
            />

            {/* 图片全屏预览 */}
            <ImageViewerModal
                isOpen={!!viewingImage}
                onClose={() => setViewingImage(null)}
                item={viewingImage}
            />
        </div>
    );
};

const MetricCard = ({ label, value, trend, trendUp, icon, color = "text-lx-black", onClick, isClickable }: any) => (
    <div
        onClick={onClick}
        className={`bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col justify-between h-28 ${isClickable ? 'cursor-pointer hover:bg-gray-100 hover:shadow-md transition-all' : ''}`}
    >
        <div className="flex justify-between items-start">
            <span className="text-xs text-gray-500 font-medium">{label}</span>
            <span className="text-gray-400">{icon}</span>
        </div>
        <div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className={`text-xs mt-1 font-medium ${trendUp ? 'text-lx-success' : 'text-lx-textSub'} ${isClickable ? 'flex items-center gap-1' : ''}`}>
                {trend}
                {isClickable && <ChevronRight size={12} />}
            </div>
        </div>
    </div>
);


const InspectionCard = ({
    id, line, time, imgUrl, status, issue, confidence, detections, imageWidth, imageHeight,
    onImageClick, onAnalyzeClick, onClick, isSelected
}: InspectionItem & {
    onImageClick?: (e: React.MouseEvent) => void;
    onAnalyzeClick?: (e: React.MouseEvent) => void;
    onClick?: () => void;
    isSelected?: boolean
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

    React.useEffect(() => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setContainerSize({ width: rect.width, height: rect.height });
        }
    }, []);

    // 计算检测框在显示区域的位置
    const renderDetections = () => {
        if (!detections || detections.length === 0 || !imageWidth || !imageHeight) return null;

        const scaleX = containerSize.width / imageWidth;
        const scaleY = containerSize.height / imageHeight;

        return detections.map((det, idx) => {
            const [x1, y1, x2, y2] = det.bbox;
            const left = x1 * scaleX;
            const top = y1 * scaleY;
            const width = (x2 - x1) * scaleX;
            const height = (y2 - y1) * scaleY;

            return (
                <div
                    key={idx}
                    className="absolute border-2 border-red-500 bg-red-500/10 pointer-events-none"
                    style={{
                        left: `${left}px`,
                        top: `${top}px`,
                        width: `${width}px`,
                        height: `${height}px`,
                    }}
                />
            );
        });
    };

    return (
        <div
            onClick={onClick}
            className={`bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all cursor-pointer group border-2 ${isSelected ? 'border-lx-gold ring-2 ring-lx-gold/20' : 'border-transparent'
                }`}
        >
            <div ref={containerRef} className="relative h-[200px] bg-gray-100 overflow-hidden" onClick={onImageClick}>
                <img
                    src={imgUrl}
                    alt="Inspection"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                {renderDetections()}

                {/* AI分析图标 */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onAnalyzeClick?.(e);
                        }}
                        className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white p-2 rounded-lg backdrop-blur-sm shadow-lg flex items-center gap-1.5 active:scale-95 transition-transform"
                    >
                        <Sparkles size={14} />
                        <span className="text-xs font-medium">AI分析</span>
                    </button>
                </div>

                {/* 检测数量角标 */}
                {detections && detections.length > 0 && (
                    <div className="absolute bottom-2 right-2 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                        {detections.length} 个缺陷
                    </div>
                )}
            </div>
            <div className="p-3">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="font-bold text-lx-black text-sm">{id.startsWith('UPL') ? 'Manual_Upload' : `Part_${id}.jpg`}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
                            <span>{line}</span>
                            <span className="w-0.5 h-2 bg-gray-300"></span>
                            <span>{time}</span>
                        </div>
                    </div>
                    {status === 'NG' ? (
                        <div className="text-right">
                            <div className="text-lx-error text-xs font-bold flex items-center justify-end gap-1">
                                <XCircle size={12} /> {issue || 'Defect'}
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5">Conf: {confidence}</div>
                        </div>
                    ) : (
                        <div className="text-lx-success text-xs font-bold flex items-center gap-1">
                            <CheckCircle size={12} /> 合格
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// 递归JSON展示组件
const JsonViewer = ({ data, level = 0 }: { data: any; level?: number }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    if (data === null) return <span className="text-gray-400">null</span>;
    if (typeof data !== 'object') {
        const isString = typeof data === 'string';
        return (
            <span className={`${isString ? 'text-green-600' : 'text-blue-600'}`}>
                {isString ? `"${data}"` : String(data)}
            </span>
        );
    }

    const isArray = Array.isArray(data);
    const isEmpty = Object.keys(data).length === 0;
    const entries = Object.entries(data);

    if (isEmpty) return <span>{isArray ? '[]' : '{}'}</span>;

    return (
        <div className="font-mono text-sm leading-6">
            <div className="flex items-start">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="mr-1 mt-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <span>{isArray ? '[' : '{'}</span>
                {!isExpanded && (
                    <span className="text-gray-400 mx-1">
                        {isArray ? `Array(${entries.length})` : `Object(${entries.length})`} ...
                    </span>
                )}
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="pl-4 border-l border-gray-100 ml-1.5"
                    >
                        {entries.map(([key, value], index) => (
                            <div key={key} className="my-0.5">
                                {!isArray && (
                                    <span className="text-purple-600 font-medium mr-1">"{key}":</span>
                                )}
                                <JsonViewer data={value} level={level + 1} />
                                {index < entries.length - 1 && <span className="text-gray-400">,</span>}
                            </div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            {isExpanded && <div>{isArray ? ']' : '}'}</div>}
            {!isExpanded && <span>{isArray ? ']' : '}'}</span>}
        </div>
    );
};

// ... (VisionAgent definitions)

// LLM分析侧边栏组件
const LLMAnalysisSidebar = ({ item, onClose }: { item: InspectionItem; onClose: () => void }) => {
    const [analysis, setAnalysis] = useState<LLMAnalysisResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [customQuery, setCustomQuery] = useState('');
    const [parsedJson, setParsedJson] = useState<any | null>(null);

    // 自动分析当前图片
    useEffect(() => {
        analyzeImage();
    }, [item.id]);

    // 尝试解析JSON
    useEffect(() => {
        if (analysis?.analysis) {
            try {
                // 处理可能包含 markdown 代码块的情况
                let cleanJson = analysis.analysis;
                if (cleanJson.includes('```json')) {
                    cleanJson = cleanJson.split('```json')[1].split('```')[0];
                } else if (cleanJson.includes('```')) {
                    cleanJson = cleanJson.split('```')[1].split('```')[0];
                }
                const parsed = JSON.parse(cleanJson);
                setParsedJson(parsed);
            } catch (e) {
                console.warn("Failed to parse analysis as JSON:", e);
                setParsedJson(null);
            }
        } else {
            setParsedJson(null);
        }
    }, [analysis]);

    const analyzeImage = async (query?: string) => {
        setIsLoading(true);
        setError(null);
        setParsedJson(null); // Reset json

        try {
            // 将图片URL转换为blob
            const response = await fetch(item.imgUrl);
            const blob = await response.blob();

            // 创建FormData
            const formData = new FormData();
            formData.append('image', blob, 'inspection.jpg');
            if (query) {
                formData.append('query', query);
            }

            // 调用LLM分析API
            const analysisResponse = await fetch(`${LLM_API_URL}/api/llm/analyze-image`, {
                method: 'POST',
                body: formData
            });

            if (!analysisResponse.ok) {
                const errorData = await analysisResponse.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${analysisResponse.status}`);
            }

            const result = await analysisResponse.json();

            if (result.success) {
                setAnalysis(result.data);
            } else {
                setError(result.error || '分析失败');
            }
        } catch (e) {
            console.error('LLM分析失败:', e);
            setError((e as Error).message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCustomQuery = () => {
        if (customQuery.trim()) {
            analyzeImage(customQuery);
            setCustomQuery('');
        }
    };

    return (
        <motion.div
            initial={{ x: 480 }}
            animate={{ x: 0 }}
            exit={{ x: 480 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col"
        >
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">AI 深度分析</h2>
                        <p className="text-sm text-white/80">大模型质检报告</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                    <X size={20} className="text-white" />
                </button>
            </div>

            {/* Image Preview */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="relative h-48 rounded-lg overflow-hidden">
                    <img
                        src={item.imgUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                        {item.id}
                    </div>
                    {item.status === 'NG' && (
                        <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded font-bold">
                            缺陷检出
                        </div>
                    )}
                </div>
            </div>

            {/* Analysis Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 space-y-4">
                        <Loader2 className="w-12 h-12 animate-spin text-purple-500" />
                        <p className="text-gray-600">AI正在深度分析中...</p>
                        <p className="text-xs text-gray-400">这可能需要10-30秒</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-64 space-y-4">
                        <XCircle className="w-12 h-12 text-red-500" />
                        <p className="text-red-600 font-medium">分析失败</p>
                        <p className="text-sm text-gray-500">{error}</p>
                        <button
                            onClick={() => analyzeImage()}
                            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                        >
                            重试
                        </button>
                    </div>
                ) : analysis ? (
                    <div className="space-y-4">
                        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-100">
                            <div className="flex items-center gap-2 mb-3">
                                <Sparkles className="w-4 h-4 text-purple-600" />
                                <h3 className="font-semibold text-gray-900">AI 分析报告</h3>
                            </div>

                            {parsedJson ? (
                                <div className="bg-white/50 rounded-lg p-2 overflow-x-auto">
                                    <JsonViewer data={parsedJson} />
                                </div>
                            ) : (
                                <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                                    {analysis.analysis}
                                </div>
                            )}
                        </div>

                        {/* Token Usage */}
                        {analysis.metadata?.usage && (
                            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                                <div className="flex justify-between mb-1">
                                    <span>Token使用</span>
                                    <span className="font-medium">{analysis.metadata.usage.total_tokens}</span>
                                </div>
                                <div className="flex justify-between text-[10px] text-gray-400">
                                    <span>输入: {analysis.metadata.usage.prompt_tokens}</span>
                                    <span>输出: {analysis.metadata.usage.completion_tokens}</span>
                                </div>
                            </div>
                        )}

                        {/* Timestamp */}
                        {analysis.timestamp && (
                            <div className="text-xs text-gray-400 text-center">
                                分析时间: {new Date(analysis.timestamp).toLocaleString('zh-CN')}
                            </div>
                        )}
                    </div>
                ) : null}
            </div>

            {/* Custom Query Input */}
            <div className="border-t border-gray-200 p-4 bg-gray-50">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={customQuery}
                        onChange={(e) => setCustomQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleCustomQuery()}
                        placeholder="输入自定义分析问题..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                        disabled={isLoading}
                    />
                    <button
                        onClick={handleCustomQuery}
                        disabled={isLoading || !customQuery.trim()}
                        className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <Send size={16} />
                    </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                    💡 尝试问: "这个缺陷严重吗？" "如何改进工艺？"
                </p>
            </div>
        </motion.div>
    );
};

export default VisionAgent;
