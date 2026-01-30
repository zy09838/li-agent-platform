import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppState, Annotation, ToolType, ImageMetadata, ImageFile, SegmentationMask, ClipboardData } from '../types';
import { v4 as uuidv4 } from 'uuid';

// 预设缺陷类型模板
export const DEFECT_TEMPLATES = [
    { label: '颗粒', color: '#ff6b6b' },
    { label: '划伤', color: '#4ecdc4' },
    { label: '磕伤', color: '#ffe66d' },
    { label: '缩痕/变形', color: '#95e1d3' },
    { label: '抛光印', color: '#f38181' },
    { label: '肥边/流挂', color: '#aa96da' },
    { label: '橘皮', color: '#fcbad3' },
    { label: '纤维丝', color: '#a8d8ea' },
    { label: '虚喷', color: '#ff9f43' },
    { label: '发白', color: '#0abde3' },
    { label: '水渍', color: '#10ac84' },
    { label: '针孔', color: '#ee5a24' },
    { label: '缩孔', color: '#9c88ff' },
    { label: '油坑', color: '#ffc312' },
    { label: '麻点', color: '#c44569' },
    { label: '漆点', color: '#6ab04c' },
    { label: '气泡', color: '#eb4d4b' },
    { label: '顶包', color: '#7ed6df' },
    { label: '过抛', color: '#e056fd' },
];

// 预设颜色板
export const PRESET_COLORS = [
    '#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181',
    '#aa96da', '#fcbad3', '#a8d8ea', '#ff9f43', '#0abde3',
    '#10ac84', '#ee5a24', '#9c88ff', '#ffc312', '#c44569',
];

// 历史记录项
interface HistoryItem {
    images: ImageFile[];
    currentImageId: string | null;
    timestamp: number;
}

type ImageFilter = 'all' | 'annotated' | 'unannotated' | 'abnormal';
type Theme = 'dark' | 'light';

interface AppStore extends AppState {
    // 主题
    theme: Theme;
    setTheme: (theme: Theme) => void;
    
    // 图片过滤
    imageFilter: ImageFilter;
    setImageFilter: (filter: ImageFilter) => void;
    getFilteredImages: () => ImageFile[];
    
    // 历史记录（撤销/重做）
    history: HistoryItem[];
    historyIndex: number;
    pushHistory: () => void;
    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;

    // 剪贴板
    clipboard: ClipboardData | null;
    copyAnnotation: () => void;
    pasteAnnotation: () => void;

    // 全屏模式
    isFullscreen: boolean;
    setFullscreen: (value: boolean) => void;

    // 图片调整
    imageAdjustments: { brightness: number; contrast: number };
    setImageAdjustments: (adj: { brightness: number; contrast: number }) => void;

    // 标注可见性
    hiddenLabels: string[];
    toggleLabelVisibility: (label: string) => void;

    // 选中多个标注
    selectedAnnotationIds: string[];
    toggleAnnotationSelection: (id: string) => void;
    clearSelection: () => void;
    deleteSelectedAnnotations: () => void;

    // Image Management
    addImages: (files: File[]) => void;
    selectImage: (id: string) => void;
    removeImage: (id: string) => void;
    importAnnotations: (data: any) => void;
    nextImage: () => void;
    prevImage: () => void;
    rotateImage: () => void;

    // Annotation Actions (operate on current image)
    setAnnotations: (annotations: Annotation[] | ((prev: Annotation[]) => Annotation[])) => void;
    addAnnotation: (annotation: Annotation) => void;
    updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
    removeAnnotation: (id: string) => void;
    toggleAnnotationLock: (id: string) => void;
    
    // 批量操作
    batchUpdateAnnotations: (ids: string[], updates: Partial<Annotation>) => void;

    // Segmentation Mask Actions
    addMask: (mask: SegmentationMask) => void;
    updateMask: (id: string, updates: Partial<SegmentationMask>) => void;
    updateMaskData: (id: string, maskData: ImageData) => void;
    removeMask: (id: string) => void;
    getMask: (id: string) => SegmentationMask | undefined;
    toggleMaskLock: (id: string) => void;

    // Metadata Actions (operate on current image)
    setMetadata: (metadata: Partial<ImageMetadata>) => void;

    // UI State
    setSelectedTool: (tool: ToolType) => void;
    setSelectedAnnotationId: (id: string | null) => void;
    setSelectedMaskId: (id: string | null) => void;
    setCurrentClassId: (classId: number) => void;
    setBrushSize: (size: number) => void;
    setZoom: (zoom: number) => void;
    setPan: (pan: { x: number; y: number }) => void;

    // 统计
    getStatistics: () => {
        totalImages: number;
        annotatedImages: number;
        totalAnnotations: number;
        totalMasks: number;
        annotationsByType: { [key: string]: number };
        progress: number;
    };

    // 获取所有使用过的标签
    getAllLabels: () => string[];

    // Helpers
    getCurrentImage: () => ImageFile | undefined;
}

const MAX_HISTORY = 50;

// 自动保存间隔 (毫秒)
const AUTO_SAVE_INTERVAL = 30000;

export const useAppStore = create<AppStore>((set, get) => ({
    images: [],
    currentImageId: null,
    selectedTool: 'select',
    selectedAnnotationId: null,
    selectedMaskId: null,
    currentClassId: 1,
    brushSize: 10,
    zoom: 1,
    pan: { x: 0, y: 0 },
    theme: 'dark',
    imageFilter: 'all',
    history: [],
    historyIndex: -1,
    clipboard: null,
    isFullscreen: false,
    imageAdjustments: { brightness: 100, contrast: 100 },
    hiddenLabels: [],
    selectedAnnotationIds: [],

    // 主题
    setTheme: (theme) => {
        set({ theme });
        document.documentElement.setAttribute('data-theme', theme);
    },

    // 全屏
    setFullscreen: (value) => set({ isFullscreen: value }),

    // 图片调整
    setImageAdjustments: (adj) => set({ imageAdjustments: adj }),

    // 标签可见性
    toggleLabelVisibility: (label) => set(state => ({
        hiddenLabels: state.hiddenLabels.includes(label)
            ? state.hiddenLabels.filter(l => l !== label)
            : [...state.hiddenLabels, label]
    })),

    // 多选
    toggleAnnotationSelection: (id) => set(state => ({
        selectedAnnotationIds: state.selectedAnnotationIds.includes(id)
            ? state.selectedAnnotationIds.filter(i => i !== id)
            : [...state.selectedAnnotationIds, id]
    })),

    clearSelection: () => set({ selectedAnnotationIds: [] }),

    deleteSelectedAnnotations: () => {
        const { selectedAnnotationIds, images, currentImageId } = get();
        if (selectedAnnotationIds.length === 0) return;
        
        set(state => ({
            images: state.images.map(img =>
                img.id === currentImageId
                    ? { ...img, annotations: img.annotations.filter(ann => !selectedAnnotationIds.includes(ann.id)) }
                    : img
            ),
            selectedAnnotationIds: [],
            selectedAnnotationId: null
        }));
        get().pushHistory();
    },

    // 剪贴板
    copyAnnotation: () => {
        const { selectedAnnotationId, getCurrentImage } = get();
        const currentImage = getCurrentImage();
        if (!currentImage || !selectedAnnotationId) return;
        
        const annotation = currentImage.annotations.find(a => a.id === selectedAnnotationId);
        if (annotation) {
            set({ clipboard: { type: 'annotation', data: { ...annotation } } });
        }
    },

    pasteAnnotation: () => {
        const { clipboard, currentImageId, addAnnotation } = get();
        if (!clipboard || clipboard.type !== 'annotation' || !currentImageId) return;
        
        const newAnnotation = {
            ...(clipboard.data as Annotation),
            id: uuidv4(),
            // 偏移一点位置
            points: (clipboard.data as Annotation).points.map((p, i) => i % 2 === 0 ? p + 20 : p + 20)
        };
        addAnnotation(newAnnotation);
    },

    // 图片过滤
    setImageFilter: (filter) => set({ imageFilter: filter }),
    
    getFilteredImages: () => {
        const { images, imageFilter } = get();
        switch (imageFilter) {
            case 'annotated':
                return images.filter(img => img.annotations.length > 0 || img.segmentationMasks.length > 0);
            case 'unannotated':
                return images.filter(img => img.annotations.length === 0 && img.segmentationMasks.length === 0);
            case 'abnormal':
                return images.filter(img => img.metadata.isAbnormal);
            default:
                return images;
        }
    },

    // 历史记录
    pushHistory: () => {
        const { images, currentImageId, history, historyIndex } = get();
        const newHistory = history.slice(0, historyIndex + 1);
        
        // 简化存储，不保存 maskData
        const simplifiedImages = images.map(img => ({
            ...img,
            segmentationMasks: img.segmentationMasks.map(m => ({
                ...m,
                maskData: null as any
            }))
        }));
        
        newHistory.push({
            images: JSON.parse(JSON.stringify(simplifiedImages)),
            currentImageId,
            timestamp: Date.now()
        });
        
        if (newHistory.length > MAX_HISTORY) {
            newHistory.shift();
        }
        
        set({
            history: newHistory,
            historyIndex: newHistory.length - 1
        });
    },

    undo: () => {
        const { history, historyIndex, images } = get();
        if (historyIndex > 0) {
            const prevState = history[historyIndex - 1];
            const restoredImages = prevState.images.map(img => {
                const currentImg = images.find(i => i.id === img.id);
                return {
                    ...img,
                    segmentationMasks: img.segmentationMasks.map(m => {
                        const currentMask = currentImg?.segmentationMasks.find(cm => cm.id === m.id);
                        return {
                            ...m,
                            maskData: currentMask?.maskData || m.maskData
                        };
                    })
                };
            });
            set({
                images: restoredImages,
                currentImageId: prevState.currentImageId,
                historyIndex: historyIndex - 1
            });
        }
    },

    redo: () => {
        const { history, historyIndex, images } = get();
        if (historyIndex < history.length - 1) {
            const nextState = history[historyIndex + 1];
            const restoredImages = nextState.images.map(img => {
                const currentImg = images.find(i => i.id === img.id);
                return {
                    ...img,
                    segmentationMasks: img.segmentationMasks.map(m => {
                        const currentMask = currentImg?.segmentationMasks.find(cm => cm.id === m.id);
                        return {
                            ...m,
                            maskData: currentMask?.maskData || m.maskData
                        };
                    })
                };
            });
            set({
                images: restoredImages,
                currentImageId: nextState.currentImageId,
                historyIndex: historyIndex + 1
            });
        }
    },

    canUndo: () => get().historyIndex > 0,
    canRedo: () => get().historyIndex < get().history.length - 1,

    getCurrentImage: () => {
        const { images, currentImageId } = get();
        return images.find(img => img.id === currentImageId);
    },

    // 获取所有标签
    getAllLabels: () => {
        const { images } = get();
        const labels = new Set<string>();
        images.forEach(img => {
            img.annotations.forEach(ann => {
                if (ann.label) labels.add(ann.label);
            });
        });
        return Array.from(labels);
    },

    // 统计
    getStatistics: () => {
        const { images } = get();
        const annotationsByType: { [key: string]: number } = {};
        
        let totalAnnotations = 0;
        let totalMasks = 0;
        let annotatedImages = 0;
        
        images.forEach(img => {
            const hasAnnotations = img.annotations.length > 0 || img.segmentationMasks.length > 0;
            if (hasAnnotations) annotatedImages++;
            
            totalAnnotations += img.annotations.length;
            totalMasks += img.segmentationMasks.length;
            
            img.annotations.forEach(ann => {
                const label = ann.label || 'Unlabeled';
                annotationsByType[label] = (annotationsByType[label] || 0) + 1;
            });
        });
        
        const progress = images.length > 0 ? Math.round((annotatedImages / images.length) * 100) : 0;
        
        return {
            totalImages: images.length,
            annotatedImages,
            totalAnnotations,
            totalMasks,
            annotationsByType,
            progress
        };
    },

    addImages: (files) => {
        const newImages: ImageFile[] = files.map(file => ({
            id: uuidv4(),
            name: file.name,
            url: URL.createObjectURL(file),
            originalFile: file,
            annotations: [],
            segmentationMasks: [],
            metadata: {
                partType: 'Unknown',
                isAbnormal: false,
            },
            rotation: 0
        }));

        set(state => ({
            images: [...state.images, ...newImages],
            currentImageId: state.currentImageId || newImages[0]?.id || null
        }));
        
        get().pushHistory();
    },

    selectImage: (id) => set({ 
        currentImageId: id, 
        selectedAnnotationId: null, 
        selectedMaskId: null,
        selectedAnnotationIds: []
    }),

    nextImage: () => {
        const { images, currentImageId } = get();
        const currentIndex = images.findIndex(img => img.id === currentImageId);
        if (currentIndex < images.length - 1) {
            set({ 
                currentImageId: images[currentIndex + 1].id,
                selectedAnnotationId: null,
                selectedMaskId: null,
                selectedAnnotationIds: []
            });
        }
    },

    prevImage: () => {
        const { images, currentImageId } = get();
        const currentIndex = images.findIndex(img => img.id === currentImageId);
        if (currentIndex > 0) {
            set({ 
                currentImageId: images[currentIndex - 1].id,
                selectedAnnotationId: null,
                selectedMaskId: null,
                selectedAnnotationIds: []
            });
        }
    },

    rotateImage: () => {
        set(state => ({
            images: state.images.map(img =>
                img.id === state.currentImageId
                    ? { ...img, rotation: ((img.rotation || 0) + 90) % 360 }
                    : img
            )
        }));
    },

    removeImage: (id) => {
        set(state => {
            const newImages = state.images.filter(img => img.id !== id);
            return {
                images: newImages,
                currentImageId: state.currentImageId === id ? (newImages[0]?.id || null) : state.currentImageId
            };
        });
        get().pushHistory();
    },

    importAnnotations: (data) => {
        set(state => {
            const updatedImages = state.images.map(img => {
                const importedData = data.find((d: any) => d.imageName === img.name);
                if (importedData) {
                    return {
                        ...img,
                        annotations: importedData.annotations || [],
                        metadata: importedData.metadata || img.metadata
                    };
                }
                return img;
            });
            return { images: updatedImages };
        });
        get().pushHistory();
    },

    setAnnotations: (annotationsOrFn) => {
        set(state => {
            const currentImg = state.images.find(img => img.id === state.currentImageId);
            if (!currentImg) return state;

            const newAnnotations = typeof annotationsOrFn === 'function'
                ? annotationsOrFn(currentImg.annotations)
                : annotationsOrFn;

            return {
                images: state.images.map(img =>
                    img.id === state.currentImageId
                        ? { ...img, annotations: newAnnotations }
                        : img
                )
            };
        });
    },

    addAnnotation: (annotation) => {
        set(state => ({
            images: state.images.map(img =>
                img.id === state.currentImageId
                    ? { ...img, annotations: [...img.annotations, { ...annotation, locked: false, visible: true }] }
                    : img
            )
        }));
        get().pushHistory();
    },

    updateAnnotation: (id, updates) => {
        set(state => ({
            images: state.images.map(img =>
                img.id === state.currentImageId
                    ? {
                        ...img,
                        annotations: img.annotations.map(ann => ann.id === id ? { ...ann, ...updates } : ann)
                    }
                    : img
            )
        }));
    },

    removeAnnotation: (id) => {
        const currentImage = get().getCurrentImage();
        const annotation = currentImage?.annotations.find(a => a.id === id);
        if (annotation?.locked) return; // 不删除锁定的标注
        
        set(state => ({
            images: state.images.map(img =>
                img.id === state.currentImageId
                    ? { ...img, annotations: img.annotations.filter(ann => ann.id !== id) }
                    : img
            ),
            selectedAnnotationId: state.selectedAnnotationId === id ? null : state.selectedAnnotationId
        }));
        get().pushHistory();
    },

    toggleAnnotationLock: (id) => {
        set(state => ({
            images: state.images.map(img =>
                img.id === state.currentImageId
                    ? {
                        ...img,
                        annotations: img.annotations.map(ann => 
                            ann.id === id ? { ...ann, locked: !ann.locked } : ann
                        )
                    }
                    : img
            )
        }));
    },

    batchUpdateAnnotations: (ids, updates) => {
        set(state => ({
            images: state.images.map(img =>
                img.id === state.currentImageId
                    ? {
                        ...img,
                        annotations: img.annotations.map(ann => 
                            ids.includes(ann.id) ? { ...ann, ...updates } : ann
                        )
                    }
                    : img
            )
        }));
        get().pushHistory();
    },

    setMetadata: (updates) => {
        set(state => ({
            images: state.images.map(img =>
                img.id === state.currentImageId
                    ? { ...img, metadata: { ...img.metadata, ...updates } }
                    : img
            )
        }));
    },

    addMask: (mask) => {
        set(state => ({
            images: state.images.map(img =>
                img.id === state.currentImageId
                    ? { ...img, segmentationMasks: [...img.segmentationMasks, { ...mask, locked: false, visible: true }] }
                    : img
            )
        }));
        get().pushHistory();
    },

    updateMask: (id, updates) => set(state => ({
        images: state.images.map(img =>
            img.id === state.currentImageId
                ? {
                    ...img,
                    segmentationMasks: img.segmentationMasks.map(mask =>
                        mask.id === id ? { ...mask, ...updates } : mask
                    )
                }
                : img
        )
    })),

    updateMaskData: (id, maskData) => set(state => ({
        images: state.images.map(img =>
            img.id === state.currentImageId
                ? {
                    ...img,
                    segmentationMasks: img.segmentationMasks.map(mask =>
                        mask.id === id ? { ...mask, maskData } : mask
                    )
                }
                : img
        )
    })),

    removeMask: (id) => {
        const currentImage = get().getCurrentImage();
        const mask = currentImage?.segmentationMasks.find(m => m.id === id);
        if (mask?.locked) return;
        
        set(state => ({
            images: state.images.map(img =>
                img.id === state.currentImageId
                    ? { ...img, segmentationMasks: img.segmentationMasks.filter(mask => mask.id !== id) }
                    : img
            ),
            selectedMaskId: state.selectedMaskId === id ? null : state.selectedMaskId
        }));
        get().pushHistory();
    },

    getMask: (id) => {
        const currentImg = get().getCurrentImage();
        return currentImg?.segmentationMasks.find(m => m.id === id);
    },

    toggleMaskLock: (id) => {
        set(state => ({
            images: state.images.map(img =>
                img.id === state.currentImageId
                    ? {
                        ...img,
                        segmentationMasks: img.segmentationMasks.map(mask => 
                            mask.id === id ? { ...mask, locked: !mask.locked } : mask
                        )
                    }
                    : img
            )
        }));
    },

    setSelectedTool: (tool) => set({ selectedTool: tool }),
    setSelectedAnnotationId: (id) => set({ selectedAnnotationId: id }),
    setSelectedMaskId: (id) => set({ selectedMaskId: id }),
    setCurrentClassId: (classId) => set({ currentClassId: classId }),
    setBrushSize: (size) => set({ brushSize: size }),
    setZoom: (zoom) => set({ zoom }),
    setPan: (pan) => set({ pan }),
}));

// 自动保存到 localStorage
if (typeof window !== 'undefined') {
    let saveTimeout: NodeJS.Timeout;
    
    useAppStore.subscribe((state) => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            try {
                const dataToSave = {
                    images: state.images.map(img => ({
                        ...img,
                        url: '', // 不保存 blob URL
                        originalFile: null,
                        segmentationMasks: img.segmentationMasks.map(m => ({
                            ...m,
                            maskData: null
                        }))
                    })),
                    currentImageId: state.currentImageId,
                    theme: state.theme
                };
                localStorage.setItem('lilian-ai-data-tool-autosave', JSON.stringify(dataToSave));
                console.log('自动保存成功', new Date().toLocaleTimeString());
            } catch (e) {
                console.error('自动保存失败', e);
            }
        }, AUTO_SAVE_INTERVAL);
    });
}
