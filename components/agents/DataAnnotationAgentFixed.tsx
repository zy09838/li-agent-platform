import React, { useRef, useEffect, useCallback, useState } from 'react';
import { 
    Download, Upload, Image as ImageIcon, Undo2, Redo2,
    BarChart3, FolderOpen, Maximize2, Minimize2, RotateCw, Copy, 
    Clipboard, ChevronLeft, ChevronRight, ArrowLeft, Filter
} from 'lucide-react';
import { useAnnotationStore } from '../../store/useAnnotationStore';
import { useDatasetStore } from '../../store/useDatasetStore';
import { generateBatchExport, generateCOCOExport, generateYOLOExport, generateVOCExport } from '../../services/exportUtils';
import { ViewType } from '../../types';
import { DatasetViewMode, DefectType, PART_CATEGORY_LABELS, DEFECT_TYPE_LABELS, DEFECT_TYPE_COLORS } from '../../types/dataset';

// 理链主题色
const THEME = {
    bgPrimary: '#1a1a1a',
    bgSecondary: '#2a2a2a',
    bgTertiary: '#3a3a3a',
    textPrimary: '#f5f5f5',
    textSecondary: '#999999',
    accentGold: '#cfa972',
    borderColor: '#404040',
    success: '#22c55e',
    danger: '#ef4444',
};

// 动态导入子组件
const ToolsPanel = React.lazy(() => import('../DataAnnotation/ToolsPanel'));
const PropertiesPanel = React.lazy(() => import('../DataAnnotation/PropertiesPanel'));
const ImageListPanel = React.lazy(() => import('../DataAnnotation/ImageListPanel'));
const AnnotationCanvas = React.lazy(() => import('../DataAnnotation/AnnotationCanvas'));

interface DataAnnotationAgentFixedProps {
    onViewChange?: (view: ViewType) => void;
}

export const DataAnnotationAgentFixed: React.FC<DataAnnotationAgentFixedProps> = ({ onViewChange }) => {
    const { 
        addImages, 
        addImagesFromUrls,
        clearImages,
        getCurrentImage, 
        images,
        undo,
        redo,
        canUndo,
        canRedo,
        getStatistics,
        removeAnnotation,
        removeMask,
        selectedAnnotationId,
        selectedMaskId,
        importAnnotations,
        nextImage,
        prevImage,
        rotateImage,
        copyAnnotation,
        pasteAnnotation,
        clipboard,
        isFullscreen,
        setFullscreen,
        selectedAnnotationIds,
        deleteSelectedAnnotations,
    } = useAnnotationStore();

    const {
        getCurrentDataset,
        getFilteredImages: getDatasetFilteredImages,
        viewMode,
        setViewMode,
        updateImageAnnotation,
        saveImageAnnotations,
        currentDatasetId,
        setCurrentDataset,
    } = useDatasetStore();
    
    const currentDataset = getCurrentDataset();
    const currentImage = getCurrentImage();
    const stageRef = useRef<any>(null);
    const [showStats, setShowStats] = useState(false);
    const [exportFormat, setExportFormat] = useState<'zip' | 'coco' | 'yolo' | 'voc'>('zip');
    const [showExportOptions, setShowExportOptions] = useState(false);
    const [splitRatio, setSplitRatio] = useState({ train: 70, val: 20, test: 10 });
    const [isDragging, setIsDragging] = useState(false);
    const [componentsLoaded, setComponentsLoaded] = useState(false);
    const [datasetImagesLoaded, setDatasetImagesLoaded] = useState(false);
    const loadedDatasetIdRef = useRef<string | null>(null);
    const lastSavedRef = useRef<string>('');

    // 从数据集加载图片（包含已保存的标注）
    useEffect(() => {
        if (currentDataset && currentDataset.id !== loadedDatasetIdRef.current) {
            const filteredImages = getDatasetFilteredImages();
            
            // 清空当前图片
            clearImages();
            lastSavedRef.current = ''; // 重置保存标识
            
            if (filteredImages.length > 0) {
                // 转换数据集图片格式为标注工具格式，恢复已保存的标注
                const annotationImages = filteredImages.map(img => {
                    // 恢复标注数据，确保类型正确
                    const restoredAnnotations = (img.annotations || []).map(ann => ({
                        id: ann.id,
                        type: ann.type as 'bbox' | 'polygon',
                        points: [...ann.points],
                        label: ann.label,
                        color: ann.color,
                        locked: ann.locked || false,
                        visible: ann.visible !== false
                    }));
                    
                    // 恢复掩码数据（不含maskData）
                    const restoredMasks = (img.masks || []).map(mask => ({
                        id: mask.id,
                        label: mask.label,
                        color: mask.color,
                        classId: mask.classId,
                        maskData: null as any, // maskData 需要单独处理
                        locked: mask.locked || false,
                        visible: mask.visible !== false
                    }));
                    
                    console.log(`[标注恢复] 图片 ${img.filename}: ${restoredAnnotations.length} 个标注, ${restoredMasks.length} 个掩码`);
                    
                    return {
                        id: img.id,
                        name: img.filename,
                        url: img.url,
                        width: img.width,
                        height: img.height,
                        annotations: restoredAnnotations,
                        segmentationMasks: restoredMasks,
                    };
                });
                
                // 使用新方法直接从URL加载图片
                addImagesFromUrls(annotationImages);
                loadedDatasetIdRef.current = currentDataset.id;
                setDatasetImagesLoaded(true);
            }
        }
    }, [currentDataset?.id]);

    // 当视图模式改变时重新加载
    useEffect(() => {
        if (currentDataset && datasetImagesLoaded && loadedDatasetIdRef.current === currentDataset.id) {
            const filteredImages = getDatasetFilteredImages();
            clearImages();
            lastSavedRef.current = ''; // 重置保存标识
            
            if (filteredImages.length > 0) {
                const annotationImages = filteredImages.map(img => {
                    const restoredAnnotations = (img.annotations || []).map(ann => ({
                        id: ann.id,
                        type: ann.type as 'bbox' | 'polygon',
                        points: [...ann.points],
                        label: ann.label,
                        color: ann.color,
                        locked: ann.locked || false,
                        visible: ann.visible !== false
                    }));
                    
                    const restoredMasks = (img.masks || []).map(mask => ({
                        id: mask.id,
                        label: mask.label,
                        color: mask.color,
                        classId: mask.classId,
                        maskData: null as any,
                        locked: mask.locked || false,
                        visible: mask.visible !== false
                    }));
                    
                    return {
                        id: img.id,
                        name: img.filename,
                        url: img.url,
                        width: img.width,
                        height: img.height,
                        annotations: restoredAnnotations,
                        segmentationMasks: restoredMasks,
                    };
                });
                addImagesFromUrls(annotationImages);
            }
        }
    }, [viewMode]);

    // 自动保存标注数据到数据集
    useEffect(() => {
        if (currentDataset && currentImage) {
            // 创建一个更精确的保存标识，包含标注内容的JSON字符串
            const annotationsJson = JSON.stringify(currentImage.annotations.map(a => ({ id: a.id, points: a.points, label: a.label })));
            const masksJson = JSON.stringify(currentImage.segmentationMasks.map(m => ({ id: m.id, label: m.label })));
            const saveKey = `${currentImage.id}-${annotationsJson}-${masksJson}`;
            
            if (saveKey === lastSavedRef.current) return;
            
            // 延迟保存，避免频繁触发
            const timer = setTimeout(() => {
                // 转换为存储格式
                const storedAnnotations = currentImage.annotations.map(ann => ({
                    id: ann.id,
                    type: ann.type as 'bbox' | 'polygon',
                    points: [...ann.points],
                    label: ann.label,
                    color: ann.color,
                    locked: ann.locked,
                    visible: ann.visible
                }));
                
                const storedMasks = currentImage.segmentationMasks.map(mask => ({
                    id: mask.id,
                    label: mask.label,
                    color: mask.color,
                    classId: mask.classId,
                    locked: mask.locked,
                    visible: mask.visible
                }));
                
                // 保存到数据集
                saveImageAnnotations(currentDataset.id, currentImage.id, storedAnnotations, storedMasks);
                lastSavedRef.current = saveKey;
                console.log(`[标注保存] 图片 ${currentImage.name}: ${storedAnnotations.length} 个标注, ${storedMasks.length} 个掩码`);
            }, 300);
            
            return () => clearTimeout(timer);
        }
    }, [currentImage?.annotations, currentImage?.segmentationMasks, currentDataset?.id, currentImage?.id]);


    const handleBackToDataset = () => {
        if (onViewChange) {
            loadedDatasetIdRef.current = null;
            setDatasetImagesLoaded(false);
            onViewChange(ViewType.DATASET_DETAIL);
        }
    };

    // 延迟加载组件
    useEffect(() => {
        const timer = setTimeout(() => {
            setComponentsLoaded(true);
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    // 拖放上传
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length > 0) {
            addImages(files);
        }
    }, [addImages]);

    // 快捷键处理
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (canUndo()) undo();
            }
            
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                if (canRedo()) redo();
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                e.preventDefault();
                copyAnnotation();
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                e.preventDefault();
                pasteAnnotation();
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedAnnotationIds.length > 0) {
                    deleteSelectedAnnotations();
                } else if (selectedAnnotationId) {
                    removeAnnotation(selectedAnnotationId);
                } else if (selectedMaskId) {
                    removeMask(selectedMaskId);
                }
            }

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                prevImage();
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                nextImage();
            }

            if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
                rotateImage();
            }

            if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
                setFullscreen(!isFullscreen);
            }

            if (e.key === 'Escape' && isFullscreen) {
                setFullscreen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [canUndo, canRedo, undo, redo, selectedAnnotationId, selectedMaskId, removeAnnotation, removeMask, 
        nextImage, prevImage, rotateImage, copyAnnotation, pasteAnnotation, isFullscreen, setFullscreen, 
        selectedAnnotationIds, deleteSelectedAnnotations]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            addImages(Array.from(e.target.files));
        }
    };

    const handleImportAnnotations = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target?.result as string);
                    importAnnotations(Array.isArray(data) ? data : [data]);
                    alert('标注导入成功！');
                } catch (error) {
                    alert('导入失败：无效的JSON格式');
                }
            };
            reader.readAsText(file);
        }
    };

    const handleExportJSON = () => {
        if (!currentImage) return;

        const data = {
            imageName: currentImage.name,
            metadata: currentImage.metadata,
            annotations: currentImage.annotations,
            segmentationMasks: currentImage.segmentationMasks.map(m => ({
                id: m.id,
                label: m.label,
                classId: m.classId,
                color: m.color
            })),
            timestamp: new Date().toISOString(),
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentImage.name.split('.')[0]}_annotations.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportImage = () => {
        if (stageRef.current) {
            const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 });
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `annotated_${currentImage?.name || 'image.png'}`;
            a.click();
        }
    };

    const handleBatchExport = async () => {
        setShowExportOptions(false);
        try {
            switch (exportFormat) {
                case 'coco':
                    await generateCOCOExport(images, splitRatio);
                    break;
                case 'yolo':
                    await generateYOLOExport(images, splitRatio);
                    break;
                case 'voc':
                    await generateVOCExport(images, splitRatio);
                    break;
                default:
                    await generateBatchExport(images);
            }
        } catch (error) {
            console.error('Export error:', error);
            alert('导出失败，请检查控制台');
        }
    };

    const stats = getStatistics();
    const currentIndex = images.findIndex(img => img.id === currentImage?.id);

    return (
        <div 
            style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* 拖放遮罩 */}
            {isDragging && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(207, 169, 114, 0.3)',
                    border: `4px dashed ${THEME.accentGold}`,
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    color: 'white',
                    fontWeight: 600
                }}>
                    释放以上传图片
                </div>
            )}

            {/* Header - 紧凑双行布局 */}
            {!isFullscreen && (
                <header style={{
                    backgroundColor: THEME.bgSecondary,
                    borderBottom: `1px solid ${THEME.borderColor}`,
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    {/* 第一行：标题和主要操作 */}
                    <div style={{
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 12px',
                        justifyContent: 'space-between',
                        borderBottom: `1px solid ${THEME.borderColor}`
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {/* 返回数据集按钮 */}
                            {currentDataset && onViewChange && (
                                <button
                                    onClick={handleBackToDataset}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 8px',
                                        backgroundColor: 'transparent',
                                        color: THEME.accentGold,
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '0.8rem'
                                    }}
                                    title="返回数据集"
                                >
                                    <ArrowLeft size={14} />
                                    返回
                                </button>
                            )}
                            
                            <h1 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ color: THEME.accentGold, fontWeight: 700 }}>理链</span>
                                <span style={{ color: THEME.textSecondary, fontWeight: 400 }}>数据标注</span>
                                {currentDataset && (
                                    <span style={{ 
                                        marginLeft: '4px', 
                                        padding: '2px 8px', 
                                        backgroundColor: THEME.bgTertiary, 
                                        borderRadius: '3px',
                                        fontSize: '0.75rem',
                                        color: THEME.textPrimary,
                                        maxWidth: '150px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {currentDataset.name}
                                    </span>
                                )}
                            </h1>
                        </div>

                        {/* 右侧：导入导出操作 */}
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                backgroundColor: THEME.bgTertiary,
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                color: THEME.textPrimary
                            }}>
                                <Upload size={12} />
                                加载图片
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleImageUpload}
                                    style={{ display: 'none' }}
                                />
                            </label>

                            {images.length > 0 && (
                                <>
                                    <label style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 10px',
                                        backgroundColor: THEME.bgTertiary,
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '0.75rem',
                                        color: THEME.textPrimary
                                    }}>
                                        <FolderOpen size={12} />
                                        导入标注
                                        <input
                                            type="file"
                                            accept=".json"
                                            onChange={handleImportAnnotations}
                                            style={{ display: 'none' }}
                                        />
                                    </label>

                                    <select
                                        value={exportFormat}
                                        onChange={(e) => setExportFormat(e.target.value as any)}
                                        style={{
                                            padding: '4px 8px',
                                            backgroundColor: THEME.bgTertiary,
                                            color: THEME.textPrimary,
                                            border: `1px solid ${THEME.borderColor}`,
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <option value="zip">ZIP</option>
                                        <option value="coco">COCO</option>
                                        <option value="yolo">YOLO</option>
                                        <option value="voc">VOC</option>
                                    </select>

                                    <button
                                        onClick={() => setShowExportOptions(true)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            padding: '4px 12px',
                                            backgroundColor: THEME.accentGold,
                                            color: '#1a1a1a',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontWeight: 600
                                        }}
                                    >
                                        <Download size={12} />
                                        导出
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* 第二行：工具栏 */}
                    <div style={{
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 12px',
                        justifyContent: 'space-between',
                        gap: '8px'
                    }}>
                        {/* 左侧工具组 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {/* 视图模式切换 */}
                            {currentDataset && (
                                <div style={{ 
                                    display: 'flex', 
                                    backgroundColor: THEME.bgTertiary, 
                                    borderRadius: '4px', 
                                    padding: '2px' 
                                }}>
                                    {[
                                        { mode: DatasetViewMode.ALL, label: '全部' },
                                        { mode: DatasetViewMode.UNANNOTATED, label: '未标注' },
                                        { mode: DatasetViewMode.ANNOTATED, label: '已标注' },
                                    ].map(({ mode, label }) => (
                                        <button
                                            key={mode}
                                            onClick={() => {
                                                setViewMode(mode);
                                                setDatasetImagesLoaded(false);
                                            }}
                                            style={{
                                                padding: '3px 8px',
                                                backgroundColor: viewMode === mode ? THEME.accentGold : 'transparent',
                                                color: viewMode === mode ? '#1a1a1a' : THEME.textSecondary,
                                                border: 'none',
                                                borderRadius: '3px',
                                                cursor: 'pointer',
                                                fontSize: '0.7rem',
                                                fontWeight: viewMode === mode ? 600 : 400
                                            }}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* 分隔线 */}
                            {currentDataset && images.length > 0 && (
                                <div style={{ width: '1px', height: '18px', backgroundColor: THEME.borderColor }} />
                            )}

                            {/* 进度条 */}
                            {images.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ 
                                        width: '60px', 
                                        height: '4px', 
                                        backgroundColor: THEME.bgTertiary,
                                        borderRadius: '2px',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{ 
                                            width: `${stats.progress}%`, 
                                            height: '100%', 
                                            backgroundColor: THEME.success,
                                            transition: 'width 0.3s'
                                        }} />
                                    </div>
                                    <span style={{ fontSize: '0.7rem', color: THEME.textSecondary }}>
                                        {stats.progress}%
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* 中间工具组 */}
                        {images.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                {/* 撤销/重做 */}
                                <button
                                    onClick={undo}
                                    disabled={!canUndo()}
                                    title="撤销 (Ctrl+Z)"
                                    style={{ 
                                        padding: '4px', 
                                        borderRadius: '4px', 
                                        background: 'none', 
                                        border: 'none', 
                                        cursor: canUndo() ? 'pointer' : 'not-allowed',
                                        opacity: canUndo() ? 1 : 0.4,
                                        color: THEME.textPrimary
                                    }}
                                >
                                    <Undo2 size={14} />
                                </button>
                                <button
                                    onClick={redo}
                                    disabled={!canRedo()}
                                    title="重做 (Ctrl+Y)"
                                    style={{ 
                                        padding: '4px', 
                                        borderRadius: '4px', 
                                        background: 'none', 
                                        border: 'none', 
                                        cursor: canRedo() ? 'pointer' : 'not-allowed',
                                        opacity: canRedo() ? 1 : 0.4,
                                        color: THEME.textPrimary
                                    }}
                                >
                                    <Redo2 size={14} />
                                </button>

                                <div style={{ width: '1px', height: '14px', backgroundColor: THEME.borderColor, margin: '0 4px' }} />

                                {/* 复制/粘贴 */}
                                <button
                                    onClick={copyAnnotation}
                                    disabled={!selectedAnnotationId}
                                    title="复制 (Ctrl+C)"
                                    style={{ 
                                        padding: '4px', 
                                        borderRadius: '4px', 
                                        background: 'none', 
                                        border: 'none', 
                                        cursor: selectedAnnotationId ? 'pointer' : 'not-allowed',
                                        opacity: selectedAnnotationId ? 1 : 0.4,
                                        color: THEME.textPrimary
                                    }}
                                >
                                    <Copy size={12} />
                                </button>
                                <button
                                    onClick={pasteAnnotation}
                                    disabled={!clipboard}
                                    title="粘贴 (Ctrl+V)"
                                    style={{ 
                                        padding: '4px', 
                                        borderRadius: '4px', 
                                        background: 'none', 
                                        border: 'none', 
                                        cursor: clipboard ? 'pointer' : 'not-allowed',
                                        opacity: clipboard ? 1 : 0.4,
                                        color: THEME.textPrimary
                                    }}
                                >
                                    <Clipboard size={12} />
                                </button>

                                <div style={{ width: '1px', height: '14px', backgroundColor: THEME.borderColor, margin: '0 4px' }} />

                                {/* 图片导航 */}
                                <button
                                    onClick={prevImage}
                                    disabled={currentIndex <= 0}
                                    title="上一张 (←)"
                                    style={{ 
                                        padding: '4px', 
                                        borderRadius: '4px', 
                                        background: 'none', 
                                        border: 'none', 
                                        cursor: currentIndex > 0 ? 'pointer' : 'not-allowed',
                                        opacity: currentIndex > 0 ? 1 : 0.4,
                                        color: THEME.textPrimary
                                    }}
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <span style={{ fontSize: '0.75rem', minWidth: '50px', textAlign: 'center', color: THEME.textPrimary }}>
                                    {currentIndex + 1} / {images.length}
                                </span>
                                <button
                                    onClick={nextImage}
                                    disabled={currentIndex >= images.length - 1}
                                    title="下一张 (→)"
                                    style={{ 
                                        padding: '4px', 
                                        borderRadius: '4px', 
                                        background: 'none', 
                                        border: 'none', 
                                        cursor: currentIndex < images.length - 1 ? 'pointer' : 'not-allowed',
                                        opacity: currentIndex < images.length - 1 ? 1 : 0.4,
                                        color: THEME.textPrimary
                                    }}
                                >
                                    <ChevronRight size={14} />
                                </button>

                                <div style={{ width: '1px', height: '14px', backgroundColor: THEME.borderColor, margin: '0 4px' }} />

                                {/* 旋转图片 */}
                                <button
                                    onClick={rotateImage}
                                    disabled={!currentImage}
                                    title="旋转 (R)"
                                    style={{ 
                                        padding: '4px', 
                                        borderRadius: '4px', 
                                        background: 'none', 
                                        border: 'none', 
                                        cursor: currentImage ? 'pointer' : 'not-allowed',
                                        opacity: currentImage ? 1 : 0.4,
                                        color: THEME.textPrimary
                                    }}
                                >
                                    <RotateCw size={12} />
                                </button>

                                {/* 统计按钮 */}
                                <button
                                    onClick={() => setShowStats(!showStats)}
                                    title="统计信息"
                                    style={{ 
                                        padding: '4px',
                                        borderRadius: '4px',
                                        backgroundColor: showStats ? THEME.accentGold : 'transparent',
                                        color: showStats ? '#1a1a1a' : THEME.textPrimary,
                                        border: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <BarChart3 size={12} />
                                </button>

                                {/* 全屏 */}
                                <button
                                    onClick={() => setFullscreen(!isFullscreen)}
                                    title="全屏 (F)"
                                    style={{ 
                                        padding: '4px',
                                        borderRadius: '4px',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: THEME.textPrimary
                                    }}
                                >
                                    <Maximize2 size={12} />
                                </button>
                            </div>
                        )}

                        {/* 右侧：当前图片操作 */}
                        {images.length > 0 && currentImage && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button
                                    onClick={handleExportJSON}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '3px 8px',
                                        backgroundColor: THEME.bgTertiary,
                                        color: THEME.textPrimary,
                                        borderRadius: '4px',
                                        fontSize: '0.7rem',
                                        cursor: 'pointer',
                                        border: 'none'
                                    }}
                                    title="导出当前图片标注"
                                >
                                    <Download size={10} />
                                    JSON
                                </button>
                            </div>
                        )}
                    </div>
                </header>
            )}

            {/* 导出选项弹窗 */}
            {showExportOptions && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999
                }} onClick={() => setShowExportOptions(false)}>
                    <div style={{
                        backgroundColor: THEME.bgSecondary,
                        padding: '24px',
                        borderRadius: '12px',
                        minWidth: '400px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                        border: `1px solid ${THEME.borderColor}`
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginBottom: '20px', fontSize: '1.1rem', color: THEME.textPrimary }}>导出选项</h3>
                        
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: THEME.textPrimary }}>
                                数据集划分比例
                            </label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                {[
                                    { key: 'train', label: '训练集' },
                                    { key: 'val', label: '验证集' },
                                    { key: 'test', label: '测试集' }
                                ].map(({ key, label }) => (
                                    <div key={key}>
                                        <span style={{ fontSize: '0.8rem', color: THEME.textSecondary }}>{label}</span>
                                        <input
                                            type="number"
                                            value={splitRatio[key as keyof typeof splitRatio]}
                                            onChange={e => setSplitRatio({ ...splitRatio, [key]: parseInt(e.target.value) || 0 })}
                                            style={{
                                                width: '60px',
                                                padding: '6px',
                                                marginLeft: '8px',
                                                backgroundColor: THEME.bgTertiary,
                                                border: `1px solid ${THEME.borderColor}`,
                                                borderRadius: '4px',
                                                color: THEME.textPrimary
                                            }}
                                        />%
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ 
                            padding: '12px', 
                            backgroundColor: THEME.bgTertiary, 
                            borderRadius: '8px',
                            marginBottom: '20px',
                            fontSize: '0.85rem',
                            color: THEME.textPrimary
                        }}>
                            <div>总图片: {images.length}</div>
                            <div>训练集: {Math.floor(images.length * splitRatio.train / 100)} 张</div>
                            <div>验证集: {Math.floor(images.length * splitRatio.val / 100)} 张</div>
                            <div>测试集: {images.length - Math.floor(images.length * splitRatio.train / 100) - Math.floor(images.length * splitRatio.val / 100)} 张</div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                onClick={() => setShowExportOptions(false)}
                                style={{
                                    padding: '8px 20px',
                                    backgroundColor: THEME.bgTertiary,
                                    color: THEME.textPrimary,
                                    borderRadius: '6px',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                取消
                            </button>
                            <button
                                onClick={handleBatchExport}
                                style={{
                                    padding: '8px 20px',
                                    backgroundColor: THEME.accentGold,
                                    color: '#1a1a1a',
                                    borderRadius: '6px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                }}
                            >
                                确认导出
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 统计信息面板 */}
            {showStats && !isFullscreen && images.length > 0 && (
                <div style={{
                    backgroundColor: THEME.bgSecondary,
                    borderBottom: `1px solid ${THEME.borderColor}`,
                    padding: '15px 20px',
                    display: 'flex',
                    gap: '20px',
                    justifyContent: 'center'
                }}>
                    {[
                        { value: stats.totalImages, label: '总图片数' },
                        { value: stats.annotatedImages, label: '已标注' },
                        { value: stats.totalAnnotations, label: '标注数' },
                        { value: stats.totalMasks, label: '分割掩码' },
                    ].map((stat, idx) => (
                        <div key={idx} style={{
                            backgroundColor: THEME.bgTertiary,
                            padding: '12px',
                            borderRadius: '8px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: THEME.accentGold }}>{stat.value}</div>
                            <div style={{ fontSize: '0.75rem', color: THEME.textSecondary, marginTop: '4px' }}>{stat.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Main Content */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {componentsLoaded && images.length > 0 ? (
                    <React.Suspense fallback={
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.textSecondary }}>
                            加载中...
                        </div>
                    }>
                        {/* Left Sidebar - Tools */}
                        {!isFullscreen && (
                            <aside style={{
                                width: '60px',
                                backgroundColor: THEME.bgSecondary,
                                borderRight: `1px solid ${THEME.borderColor}`,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                padding: '20px 0'
                            }}>
                                <ToolsPanel />
                            </aside>
                        )}

                        {/* Image List Panel */}
                        {!isFullscreen && (
                            <aside style={{
                                width: '200px',
                                backgroundColor: THEME.bgSecondary,
                                borderRight: `1px solid ${THEME.borderColor}`,
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                <ImageListPanel />
                            </aside>
                        )}

                        {/* Center - Canvas */}
                        <main style={{
                            flex: 1,
                            backgroundColor: THEME.bgPrimary,
                            position: 'relative',
                            overflow: 'hidden',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}>
                            <AnnotationCanvas ref={stageRef} />
                            
                            {/* 全屏时显示退出按钮 */}
                            {isFullscreen && (
                                <button
                                    onClick={() => setFullscreen(false)}
                                    style={{
                                        position: 'absolute',
                                        top: '20px',
                                        right: '20px',
                                        padding: '8px 16px',
                                        backgroundColor: 'rgba(0,0,0,0.7)',
                                        color: 'white',
                                        borderRadius: '6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        zIndex: 100,
                                        border: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Minimize2 size={16} />
                                    退出全屏 (Esc)
                                </button>
                            )}
                        </main>

                        {/* Right Sidebar - Properties */}
                        {!isFullscreen && (
                            <aside style={{
                                width: '300px',
                                backgroundColor: THEME.bgSecondary,
                                borderLeft: `1px solid ${THEME.borderColor}`,
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                <PropertiesPanel />
                            </aside>
                        )}
                    </React.Suspense>
                ) : (
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        gap: '20px'
                    }}>
                        <div style={{ fontSize: '4rem' }}>📷</div>
                        <div style={{ fontSize: '1.2rem', color: THEME.textPrimary }}>
                            数据标注工具
                        </div>
                        <div style={{ fontSize: '0.9rem', color: THEME.textSecondary, textAlign: 'center' }}>
                            拖拽图片到此处，或点击上方"加载图片"按钮开始标注
                        </div>
                        <div style={{ 
                            marginTop: '20px',
                            padding: '15px 20px',
                            backgroundColor: THEME.bgSecondary,
                            borderRadius: '8px',
                            border: `1px solid ${THEME.borderColor}`,
                            fontSize: '0.85rem',
                            color: THEME.textSecondary,
                            maxWidth: '400px'
                        }}>
                            <div style={{ marginBottom: '8px', fontWeight: 600, color: THEME.textPrimary }}>支持功能：</div>
                            <div>✓ 边界框标注</div>
                            <div>✓ 多边形标注</div>
                            <div>✓ 语义分割</div>
                            <div>✓ 批量导出 (COCO/YOLO/VOC)</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DataAnnotationAgentFixed;
