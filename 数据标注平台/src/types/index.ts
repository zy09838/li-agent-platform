export type ToolType = 'select' | 'bbox' | 'polygon' | 'brush' | 'eraser' | 'polygon_mask';

export interface Point {
    x: number;
    y: number;
}

export interface Annotation {
    id: string;
    type: 'bbox' | 'polygon';
    points: number[]; // [x, y, w, h] for bbox, [x1, y1, x2, y2...] for polygon
    label: string;
    color: string;
    locked?: boolean; // 锁定状态
    visible?: boolean; // 可见性
}

export interface SegmentationMask {
    id: string;
    label: string;
    color: string;
    classId: number; // 类别ID，用于mask像素值
    maskData: ImageData; // 像素级mask数据
    locked?: boolean;
    visible?: boolean;
}

export interface ImageMetadata {
    partType: string;
    isAbnormal: boolean;
}

export interface ImageFile {
    id: string;
    name: string;
    url: string;
    annotations: Annotation[];
    segmentationMasks: SegmentationMask[]; // 语义分割mask列表
    metadata: ImageMetadata;
    originalFile?: File; // Store original file for export
    rotation?: number; // 图片旋转角度 0, 90, 180, 270
}

export interface AppState {
    images: ImageFile[];
    currentImageId: string | null;
    selectedTool: ToolType;
    selectedAnnotationId: string | null;
    selectedMaskId: string | null; // 当前选中的mask
    currentClassId: number; // 当前标注的类别ID
    brushSize: number; // 画笔大小
    zoom: number;
    pan: Point;
}

// 剪贴板数据
export interface ClipboardData {
    type: 'annotation' | 'mask';
    data: Annotation | Omit<SegmentationMask, 'maskData'>;
}

// 导出选项
export interface ExportOptions {
    format: 'zip' | 'coco' | 'yolo' | 'voc';
    splitRatio: { train: number; val: number; test: number };
    selectedOnly: boolean;
    includeImages: boolean;
    includeMasks: boolean;
}
