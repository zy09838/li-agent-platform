import React, { useRef, useEffect, useCallback, useState } from 'react';
import ToolsPanel from '../DataAnnotation/ToolsPanel';
import PropertiesPanel from '../DataAnnotation/PropertiesPanel';
import ImageListPanel from '../DataAnnotation/ImageListPanel';
import AnnotationCanvas from '../DataAnnotation/AnnotationCanvas';
import { 
    Download, Upload, Image as ImageIcon, Undo2, Redo2, Sun, Moon, 
    BarChart3, FolderOpen, Maximize2, Minimize2, RotateCw, Copy, 
    Clipboard, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useAnnotationStore } from '../../store/useAnnotationStore';
import Konva from 'konva';
import { generateBatchExport, generateCOCOExport, generateYOLOExport, generateVOCExport } from '../../services/exportUtils';

// 理链主题色
const THEME = {
    bgPrimary: '#1a1a1a',
    bgSecondary: '#2a2a2a',
    bgTertiary: '#3a3a3a',
    textPrimary: '#f5f5f5',
    textSecondary: '#999999',
    accentGold: '#cfa972',
    accentBlue: '#3b82f6',
    borderColor: '#404040',
    success: '#22c55e',
    danger: '#ef4444',
};

export const DataAnnotationAgent: React.FC = () => {
    const { 
        addImages, 
        getCurrentImage, 
        images,
        undo,
        redo,
        canUndo,
        canRedo,
        theme,
        setTheme,
        getStatistics,
        setSelectedTool,
        setBrushSize,
        brushSize,
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
    
    const currentImage = getCurrentImage();
    const stageRef = useRef<Konva.Stage>(null);
    const [showStats, setShowStats] = useState(false);
    const [exportFormat, setExportFormat] = useState<'zip' | 'coco' | 'yolo' | 'voc'>('zip');
    const [showExportOptions, setShowExportOptions] = useState(false);
    const [splitRatio, setSplitRatio] = useState({ train: 70, val: 20, test: 10 });
    const [isDragging, setIsDragging] = useState(false);

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
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return;
        }

        // Ctrl/Cmd + Z: 撤销
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            if (canUndo()) undo();
        }
        
        // Ctrl/Cmd + Shift + Z 或 Ctrl/Cmd + Y: 重做
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            if (canRedo()) redo();
        }

        // Ctrl/Cmd + C: 复制
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
            e.preventDefault();
            copyAnnotation();
        }

        // Ctrl/Cmd + V: 粘贴
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
            e.preventDefault();
            pasteAnnotation();
        }

        // Delete/Backspace: 删除选中项
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedAnnotationIds.length > 0) {
                deleteSelectedAnnotations();
            } else if (selectedAnnotationId) {
                removeAnnotation(selectedAnnotationId);
            } else if (selectedMaskId) {
                removeMask(selectedMaskId);
            }
        }

        // 数字键切换工具
        if (e.key === '1') setSelectedTool('select');
        if (e.key === '2') setSelectedTool('bbox');
        if (e.key === '3') setSelectedTool('polygon');
        if (e.key === '4') setSelectedTool('polygon_mask');
        if (e.key === '5') setSelectedTool('brush');
        if (e.key === '6') setSelectedTool('eraser');

        // [ ] 调整画笔大小
        if (e.key === '[') {
            setBrushSize(Math.max(1, brushSize - 5));
        }
        if (e.key === ']') {
            setBrushSize(Math.min(100, brushSize + 5));
        }

        // ← → 切换图片
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            prevImage();
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            nextImage();
        }

        // R 旋转图片
        if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
            rotateImage();
        }

        // F 全屏
        if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
            setFullscreen(!isFullscreen);
        }

        // Escape 退出全屏
        if (e.key === 'Escape' && isFullscreen) {
            setFullscreen(false);
        }
    }, [canUndo, canRedo, undo, redo, selectedAnnotationId, selectedMaskId, removeAnnotation, removeMask, 
        setSelectedTool, setBrushSize, brushSize, nextImage, prevImage, rotateImage, 
        copyAnnotation, pasteAnnotation, isFullscreen, setFullscreen, selectedAnnotationIds, deleteSelectedAnnotations]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

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

            {/* Header */}
            {!isFullscreen && (
                <header style={{
                    height: '60px',
                    backgroundColor: THEME.bgSecondary,
                    borderBottom: `1px solid ${THEME.borderColor}`,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 20px',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <h1 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ 
                                color: THEME.accentGold,
                                fontWeight: 700
                            }}>理链AI</span>
                            <span style={{ color: THEME.textSecondary, fontWeight: 400 }}>Data Tool</span>
                        </h1>
                        
                        {/* 进度条 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ 
                                width: '100px', 
                                height: '6px', 
                                backgroundColor: THEME.bgTertiary,
                                borderRadius: '3px',
                                overflow: 'hidden'
                            }}>
                                <div style={{ 
                                    width: `${stats.progress}%`, 
                                    height: '100%', 
                                    backgroundColor: THEME.success,
                                    transition: 'width 0.3s'
                                }} />
                            </div>
                            <span style={{ fontSize: '0.8rem', color: THEME.textSecondary }}>
                                {stats.progress}%
                            </span>
                        </div>
                        
                        {/* 撤销/重做 */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                                onClick={undo}
                                disabled={!canUndo()}
                                title="撤销 (Ctrl+Z)"
                                style={{ 
                                    padding: '8px', 
                                    borderRadius: '6px', 
                                    background: 'none', 
                                    border: 'none', 
                                    cursor: canUndo() ? 'pointer' : 'not-allowed',
                                    opacity: canUndo() ? 1 : 0.4,
                                    color: THEME.textPrimary
                                }}
                            >
                                <Undo2 size={18} />
                            </button>
                            <button
                                onClick={redo}
                                disabled={!canRedo()}
                                title="重做 (Ctrl+Y)"
                                style={{ 
                                    padding: '8px', 
                                    borderRadius: '6px', 
                                    background: 'none', 
                                    border: 'none', 
                                    cursor: canRedo() ? 'pointer' : 'not-allowed',
                                    opacity: canRedo() ? 1 : 0.4,
                                    color: THEME.textPrimary
                                }}
                            >
                                <Redo2 size={18} />
                            </button>
                        </div>

                        {/* 复制/粘贴 */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                                onClick={copyAnnotation}
                                disabled={!selectedAnnotationId}
                                title="复制 (Ctrl+C)"
                                style={{ 
                                    padding: '8px', 
                                    borderRadius: '6px', 
                                    background: 'none', 
                                    border: 'none', 
                                    cursor: selectedAnnotationId ? 'pointer' : 'not-allowed',
                                    opacity: selectedAnnotationId ? 1 : 0.4,
                                    color: THEME.textPrimary
                                }}
                            >
                                <Copy size={16} />
                            </button>
                            <button
                                onClick={pasteAnnotation}
                                disabled={!clipboard}
                                title="粘贴 (Ctrl+V)"
                                style={{ 
                                    padding: '8px', 
                                    borderRadius: '6px', 
                                    background: 'none', 
                                    border: 'none', 
                                    cursor: clipboard ? 'pointer' : 'not-allowed',
                                    opacity: clipboard ? 1 : 0.4,
                                    color: THEME.textPrimary
                                }}
                            >
                                <Clipboard size={16} />
                            </button>
                        </div>

                        {/* 图片导航 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button
                                onClick={prevImage}
                                disabled={currentIndex <= 0}
                                title="上一张 (←)"
                                style={{ 
                                    padding: '8px', 
                                    borderRadius: '6px', 
                                    background: 'none', 
                                    border: 'none', 
                                    cursor: currentIndex > 0 ? 'pointer' : 'not-allowed',
                                    opacity: currentIndex > 0 ? 1 : 0.4,
                                    color: THEME.textPrimary
                                }}
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <span style={{ fontSize: '0.85rem', minWidth: '60px', textAlign: 'center', color: THEME.textPrimary }}>
                                {currentIndex + 1} / {images.length}
                            </span>
                            <button
                                onClick={nextImage}
                                disabled={currentIndex >= images.length - 1}
                                title="下一张 (→)"
                                style={{ 
                                    padding: '8px', 
                                    borderRadius: '6px', 
                                    background: 'none', 
                                    border: 'none', 
                                    cursor: currentIndex < images.length - 1 ? 'pointer' : 'not-allowed',
                                    opacity: currentIndex < images.length - 1 ? 1 : 0.4,
                                    color: THEME.textPrimary
                                }}
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>

                        {/* 旋转图片 */}
                        <button
                            onClick={rotateImage}
                            disabled={!currentImage}
                            title="旋转 (R)"
                            style={{ 
                                padding: '8px', 
                                borderRadius: '6px', 
                                background: 'none', 
                                border: 'none', 
                                cursor: currentImage ? 'pointer' : 'not-allowed',
                                opacity: currentImage ? 1 : 0.4,
                                color: THEME.textPrimary
                            }}
                        >
                            <RotateCw size={16} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {/* 统计按钮 */}
                        <button
                            onClick={() => setShowStats(!showStats)}
                            title="统计信息"
                            style={{ 
                                padding: '8px',
                                borderRadius: '6px',
                                backgroundColor: showStats ? THEME.accentGold : 'transparent',
                                color: showStats ? '#1a1a1a' : THEME.textPrimary,
                                border: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <BarChart3 size={18} />
                        </button>

                        {/* 全屏 */}
                        <button
                            onClick={() => setFullscreen(!isFullscreen)}
                            title="全屏 (F)"
                            style={{ 
                                padding: '8px',
                                borderRadius: '6px',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: THEME.textPrimary
                            }}
                        >
                            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                        </button>

                        {/* 主题切换 */}
                        <button
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            title={theme === 'dark' ? '切换亮色' : '切换暗色'}
                            style={{ 
                                padding: '8px',
                                borderRadius: '6px',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: THEME.textPrimary
                            }}
                        >
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>

                        <div style={{ width: '1px', height: '24px', backgroundColor: THEME.borderColor }} />

                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '8px 16px',
                            backgroundColor: THEME.bgTertiary,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            color: THEME.textPrimary
                        }}>
                            <Upload size={16} />
                            加载图片
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handleImageUpload}
                                style={{ display: 'none' }}
                            />
                        </label>

                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '8px 16px',
                            backgroundColor: THEME.bgTertiary,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            color: THEME.textPrimary
                        }}>
                            <FolderOpen size={16} />
                            导入标注
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleImportAnnotations}
                                style={{ display: 'none' }}
                            />
                        </label>

                        <button
                            onClick={handleExportImage}
                            disabled={!currentImage}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '8px 16px',
                                backgroundColor: THEME.bgTertiary,
                                color: THEME.textPrimary,
                                borderRadius: '6px',
                                fontSize: '0.9rem',
                                opacity: currentImage ? 1 : 0.5,
                                cursor: currentImage ? 'pointer' : 'not-allowed',
                                border: 'none'
                            }}
                        >
                            <ImageIcon size={16} />
                            保存图片
                        </button>

                        <button
                            onClick={handleExportJSON}
                            disabled={!currentImage}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '8px 16px',
                                backgroundColor: THEME.bgTertiary,
                                color: THEME.textPrimary,
                                borderRadius: '6px',
                                fontSize: '0.9rem',
                                opacity: currentImage ? 1 : 0.5,
                                cursor: currentImage ? 'pointer' : 'not-allowed',
                                border: 'none'
                            }}
                        >
                            <Download size={16} />
                            导出JSON
                        </button>

                        {/* 导出格式选择 */}
                        <div style={{ position: 'relative' }}>
                            <select
                                value={exportFormat}
                                onChange={(e) => setExportFormat(e.target.value as any)}
                                style={{
                                    padding: '8px 12px',
                                    backgroundColor: THEME.bgTertiary,
                                    color: THEME.textPrimary,
                                    border: `1px solid ${THEME.borderColor}`,
                                    borderRadius: '6px',
                                    fontSize: '0.9rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="zip">ZIP格式</option>
                                <option value="coco">COCO格式</option>
                                <option value="yolo">YOLO格式</option>
                                <option value="voc">VOC格式</option>
                            </select>
                        </div>

                        <button
                            onClick={() => setShowExportOptions(true)}
                            disabled={images.length === 0}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '8px 16px',
                                backgroundColor: THEME.accentGold,
                                color: '#1a1a1a',
                                borderRadius: '6px',
                                fontSize: '0.9rem',
                                opacity: images.length > 0 ? 1 : 0.5,
                                cursor: images.length > 0 ? 'pointer' : 'not-allowed',
                                border: 'none',
                                fontWeight: 600
                            }}
                        >
                            <Download size={16} />
                            批量导出
                        </button>
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
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: THEME.textSecondary }}>训练集</span>
                                    <input
                                        type="number"
                                        value={splitRatio.train}
                                        onChange={e => setSplitRatio({ ...splitRatio, train: parseInt(e.target.value) || 0 })}
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
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: THEME.textSecondary }}>验证集</span>
                                    <input
                                        type="number"
                                        value={splitRatio.val}
                                        onChange={e => setSplitRatio({ ...splitRatio, val: parseInt(e.target.value) || 0 })}
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
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: THEME.textSecondary }}>测试集</span>
                                    <input
                                        type="number"
                                        value={splitRatio.test}
                                        onChange={e => setSplitRatio({ ...splitRatio, test: parseInt(e.target.value) || 0 })}
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
            {showStats && !isFullscreen && (
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
                    {Object.entries(stats.annotationsByType).slice(0, 5).map(([label, count]) => (
                        <div key={label} style={{
                            backgroundColor: THEME.bgTertiary,
                            padding: '12px',
                            borderRadius: '8px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: THEME.accentGold }}>{count}</div>
                            <div style={{ fontSize: '0.75rem', color: THEME.textSecondary, marginTop: '4px' }}>{label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Main Content */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
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
            </div>
        </div>
    );
};

export default DataAnnotationAgent;
