import React, { useState, useRef } from 'react';
import { ViewType } from '../types';
import { 
  ArrowLeft, Upload, Download, Tag, Image as ImageIcon, 
  CheckCircle, Circle, Trash2, Eye, X, FolderOpen
} from 'lucide-react';
import { useDatasetStore } from '../store/useDatasetStore';
import {
  DatasetImage,
  DatasetViewMode,
  DefectType,
  ExportFormat,
  PART_CATEGORY_LABELS,
  DEFECT_TYPE_LABELS,
  DEFECT_TYPE_COLORS
} from '../types/dataset';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface DatasetDetailProps {
  onViewChange: (view: ViewType) => void;
}

export const DatasetDetail: React.FC<DatasetDetailProps> = ({ onViewChange }) => {
  const { 
    getCurrentDataset, 
    getFilteredImages,
    viewMode,
    setViewMode,
    addImages,
    removeImage,
    setCurrentDataset
  } = useDatasetStore();
  
  const dataset = getCurrentDataset();
  const filteredImages = getFilteredImages();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const annotationInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  if (!dataset) {
    return (
      <div className="container mx-auto px-10 py-8 text-center">
        <p className="text-gray-500">数据集不存在</p>
        <button
          onClick={() => onViewChange(ViewType.DATASET_HOME)}
          className="mt-4 px-4 py-2 bg-lx-gold text-white rounded-lg"
        >
          返回列表
        </button>
      </div>
    );
  }

  const handleBack = () => {
    setCurrentDataset(null);
    onViewChange(ViewType.DATASET_HOME);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    
    const newImages: Array<{
      filename: string;
      url: string;
      width: number;
      height: number;
    }> = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      
      try {
        const url = await readFileAsDataURL(file);
        const dimensions = await getImageDimensions(url);
        
        newImages.push({
          filename: file.name,
          url,
          width: dimensions.width,
          height: dimensions.height
        });
      } catch (err) {
        console.error('Failed to load image:', file.name, err);
      }
    }
    
    if (newImages.length > 0) {
      addImages(dataset.id, newImages);
    }
    
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleStartAnnotation = () => {
    onViewChange(ViewType.DATA_ANNOTATION);
  };

  const handleDeleteImage = (imageId: string) => {
    if (confirm('确定要删除这张图片吗？')) {
      removeImage(dataset.id, imageId);
      setSelectedImageId(null);
    }
  };

  // 获取缺陷分布数据
  const defectDistribution = Object.entries(dataset.stats.defectDistribution)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="container mx-auto px-10 py-8 max-w-[1440px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{dataset.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span className="px-2 py-0.5 bg-gray-100 rounded">
                {PART_CATEGORY_LABELS[dataset.partCategory]}
              </span>
              {dataset.defectTypes.map(type => (
                <span 
                  key={type}
                  className="px-2 py-0.5 rounded text-white text-xs"
                  style={{ backgroundColor: DEFECT_TYPE_COLORS[type] }}
                >
                  {DEFECT_TYPE_LABELS[type]}
                </span>
              ))}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:border-lx-gold transition-colors disabled:opacity-50"
          >
            <Upload size={16} />
            {isUploading ? '上传中...' : '上传图片'}
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:border-lx-gold transition-colors"
          >
            <FolderOpen size={16} />
            导入标注
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            disabled={dataset.stats.annotatedImages === 0}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:border-lx-gold transition-colors disabled:opacity-50"
          >
            <Download size={16} />
            导出
          </button>
          <button
            onClick={handleStartAnnotation}
            className="flex items-center gap-2 px-5 py-2 bg-lx-gold text-white rounded-lg hover:bg-lx-goldHover transition-colors"
          >
            <Tag size={16} />
            开始标注
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <div className="text-sm text-gray-500">图片总数</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{dataset.stats.totalImages}</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <div className="text-sm text-gray-500">已标注</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{dataset.stats.annotatedImages}</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <div className="text-sm text-gray-500">未标注</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{dataset.stats.unannotatedImages}</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <div className="text-sm text-gray-500">完成率</div>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-lx-gold rounded-full"
                style={{ width: `${dataset.stats.completionRate}%` }}
              />
            </div>
            <span className="text-lg font-bold text-gray-900">{dataset.stats.completionRate}%</span>
          </div>
        </div>
      </div>

      {/* Defect Distribution */}
      {defectDistribution.length > 0 && (
        <div className="bg-white p-5 rounded-xl shadow-sm mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">缺陷分布</h3>
          <div className="flex flex-wrap gap-4">
            {defectDistribution.map(([type, count]) => (
              <div key={type} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: DEFECT_TYPE_COLORS[type as DefectType] }}
                />
                <span className="text-sm text-gray-600">{DEFECT_TYPE_LABELS[type as DefectType]}</span>
                <span className="text-sm font-medium text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View Mode Tabs & Image Grid */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center gap-1 p-2 border-b border-gray-100 bg-gray-50">
          <button
            onClick={() => setViewMode(DatasetViewMode.ALL)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === DatasetViewMode.ALL 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            全部 ({dataset.stats.totalImages})
          </button>
          <button
            onClick={() => setViewMode(DatasetViewMode.UNANNOTATED)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === DatasetViewMode.UNANNOTATED 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            未标注 ({dataset.stats.unannotatedImages})
          </button>
          <button
            onClick={() => setViewMode(DatasetViewMode.ANNOTATED)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === DatasetViewMode.ANNOTATED 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            已标注 ({dataset.stats.annotatedImages})
          </button>
        </div>

        {/* Image Grid */}
        <div className="p-4">
          {filteredImages.length === 0 ? (
            <div className="py-16 text-center">
              <ImageIcon className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">
                {dataset.stats.totalImages === 0 
                  ? '暂无图片，点击上方按钮上传' 
                  : '当前筛选条件下没有图片'}
              </p>
              {dataset.stats.totalImages === 0 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-lx-gold text-white rounded-lg hover:bg-lx-goldHover"
                >
                  上传图片
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-3">
              {filteredImages.map((image) => (
                <div
                  key={image.id}
                  className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer group"
                  onClick={() => setSelectedImageId(image.id)}
                >
                  <img
                    src={image.url}
                    alt={image.filename}
                    className="w-full h-full object-cover"
                  />
                  {/* Annotation Status Badge */}
                  <div className="absolute top-2 left-2">
                    {image.isAnnotated ? (
                      <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                        <CheckCircle size={12} className="text-white" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 bg-gray-400 rounded-full flex items-center justify-center">
                        <Circle size={12} className="text-white" />
                      </div>
                    )}
                  </div>
                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedImageId(image.id);
                      }}
                      className="p-2 bg-white rounded-full hover:bg-gray-100"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteImage(image.id);
                      }}
                      className="p-2 bg-white rounded-full hover:bg-red-50 text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {/* Defect Tags */}
                  {image.defectTypes.length > 0 && (
                    <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
                      {image.defectTypes.slice(0, 2).map(type => (
                        <span 
                          key={type}
                          className="px-1.5 py-0.5 text-[10px] rounded text-white"
                          style={{ backgroundColor: DEFECT_TYPE_COLORS[type] }}
                        >
                          {DEFECT_TYPE_LABELS[type]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Image Preview Modal */}
      {selectedImageId && (
        <ImagePreviewModal
          image={dataset.images.find(img => img.id === selectedImageId)!}
          onClose={() => setSelectedImageId(null)}
          onDelete={() => handleDeleteImage(selectedImageId)}
          onAnnotate={() => {
            setSelectedImageId(null);
            handleStartAnnotation();
          }}
        />
      )}

      {/* Export Modal */}
      {showExportModal && (
        <ExportModal
          dataset={dataset}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportAnnotationsModal
          dataset={dataset}
          onClose={() => setShowImportModal(false)}
        />
      )}
    </div>
  );
};

// 图片预览弹窗 - 支持展示标注结果
const ImagePreviewModal: React.FC<{
  image: DatasetImage;
  onClose: () => void;
  onDelete: () => void;
  onAnnotate: () => void;
}> = ({ image, onClose, onDelete, onAnnotate }) => {
  const [showAnnotations, setShowAnnotations] = React.useState(true);
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const [imageSize, setImageSize] = React.useState({ width: 0, height: 0 });
  const imgRef = React.useRef<HTMLImageElement>(null);

  // 计算标注框在显示图片上的实际位置
  const calculateAnnotationStyle = (annotation: DatasetImage['annotations'][0]) => {
    if (!imgRef.current || !imageLoaded) return null;
    
    const displayWidth = imgRef.current.clientWidth;
    const displayHeight = imgRef.current.clientHeight;
    const scaleX = displayWidth / image.width;
    const scaleY = displayHeight / image.height;
    
    if (annotation.type === 'bbox' && annotation.points.length >= 4) {
      // YOLO 格式: [x_center, y_center, width, height] (归一化) 或 [x, y, w, h] (像素)
      // 也可能是 [x1, y1, x2, y2] 格式
      let x, y, w, h;
      
      // 判断是否是归一化坐标（值在0-1之间）
      const isNormalized = annotation.points.every(p => p >= 0 && p <= 1);
      
      if (isNormalized) {
        // 归一化的中心点格式
        const [cx, cy, nw, nh] = annotation.points;
        x = (cx - nw / 2) * image.width;
        y = (cy - nh / 2) * image.height;
        w = nw * image.width;
        h = nh * image.height;
      } else if (annotation.points[2] > annotation.points[0] && annotation.points[3] > annotation.points[1]) {
        // [x1, y1, x2, y2] 格式
        x = annotation.points[0];
        y = annotation.points[1];
        w = annotation.points[2] - annotation.points[0];
        h = annotation.points[3] - annotation.points[1];
      } else {
        // [x, y, w, h] 格式
        [x, y, w, h] = annotation.points;
      }
      
      return {
        left: x * scaleX,
        top: y * scaleY,
        width: w * scaleX,
        height: h * scaleY
      };
    } else if (annotation.type === 'polygon' && annotation.points.length >= 6) {
      // 多边形: 计算边界框
      const xs = annotation.points.filter((_, i) => i % 2 === 0);
      const ys = annotation.points.filter((_, i) => i % 2 === 1);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      
      return {
        left: minX * scaleX,
        top: minY * scaleY,
        width: (maxX - minX) * scaleX,
        height: (maxY - minY) * scaleY
      };
    }
    return null;
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
    if (imgRef.current) {
      setImageSize({
        width: imgRef.current.clientWidth,
        height: imgRef.current.clientHeight
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div className="relative max-w-5xl max-h-[90vh] mx-4" onClick={(e) => e.stopPropagation()}>
        {/* 图片容器 */}
        <div className="relative inline-block">
          <img
            ref={imgRef}
            src={image.url}
            alt={image.filename}
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
            onLoad={handleImageLoad}
          />
          
          {/* 标注框叠加层 */}
          {showAnnotations && imageLoaded && image.annotations && image.annotations.length > 0 && (
            <div className="absolute inset-0 pointer-events-none">
              {image.annotations.map((annotation) => {
                const style = calculateAnnotationStyle(annotation);
                if (!style) return null;
                
                return (
                  <div
                    key={annotation.id}
                    className="absolute border-2 rounded"
                    style={{
                      left: style.left,
                      top: style.top,
                      width: style.width,
                      height: style.height,
                      borderColor: annotation.color || '#ff6b6b',
                      backgroundColor: `${annotation.color || '#ff6b6b'}20`
                    }}
                  >
                    {/* 标签 */}
                    <div 
                      className="absolute -top-5 left-0 px-1.5 py-0.5 text-[10px] text-white rounded-t whitespace-nowrap"
                      style={{ backgroundColor: annotation.color || '#ff6b6b' }}
                    >
                      {annotation.label || '未标记'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* 工具栏 */}
        <div className="absolute top-4 right-4 flex gap-2">
          {image.annotations && image.annotations.length > 0 && (
            <button
              onClick={() => setShowAnnotations(!showAnnotations)}
              className={`p-2 rounded-lg transition-colors ${
                showAnnotations 
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-600 text-white'
              }`}
              title={showAnnotations ? '隐藏标注' : '显示标注'}
            >
              <Eye size={20} />
            </button>
          )}
          <button
            onClick={onAnnotate}
            className="p-2 bg-lx-gold text-white rounded-lg hover:bg-lx-goldHover"
            title="标注此图"
          >
            <Tag size={20} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            title="删除"
          >
            <Trash2 size={20} />
          </button>
          <button
            onClick={onClose}
            className="p-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* 图片信息 */}
        <div className="absolute bottom-4 left-4 right-4 bg-black/60 text-white p-3 rounded-lg">
          <div className="font-medium">{image.filename}</div>
          <div className="text-sm text-white/70 mt-1 flex items-center gap-3">
            <span>{image.width} × {image.height}</span>
            <span>·</span>
            {image.isAnnotated ? (
              <>
                <span className="text-green-400">{image.annotationCount} 个标注</span>
                {image.defectTypes && image.defectTypes.length > 0 && (
                  <>
                    <span>·</span>
                    <span className="flex gap-1">
                      {image.defectTypes.slice(0, 3).map(type => (
                        <span 
                          key={type}
                          className="px-1.5 py-0.5 text-[10px] rounded"
                          style={{ backgroundColor: DEFECT_TYPE_COLORS[type] }}
                        >
                          {DEFECT_TYPE_LABELS[type]}
                        </span>
                      ))}
                      {image.defectTypes.length > 3 && (
                        <span className="text-white/50">+{image.defectTypes.length - 3}</span>
                      )}
                    </span>
                  </>
                )}
              </>
            ) : (
              <span className="text-amber-400">未标注</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// 导出弹窗
const ExportModal: React.FC<{
  dataset: ReturnType<typeof useDatasetStore.getState>['datasets'][0];
  onClose: () => void;
}> = ({ dataset, onClose }) => {
  const [format, setFormat] = useState<ExportFormat>(ExportFormat.YOLO);
  const [includeImages, setIncludeImages] = useState(true);
  const [onlyAnnotated, setOnlyAnnotated] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      const zip = new JSZip();
      const images = onlyAnnotated 
        ? dataset.images.filter(img => img.isAnnotated)
        : dataset.images;
      
      if (format === ExportFormat.YOLO) {
        // YOLO格式导出
        const classNames = dataset.defectTypes.map(type => DEFECT_TYPE_LABELS[type]);
        zip.file('classes.txt', classNames.join('\n'));

        const labelsFolder = zip.folder('labels');
        const imagesFolder = includeImages ? zip.folder('images') : null;

        for (const image of images) {
          // 从真实标注数据生成YOLO标签
          const labelLines: string[] = [];

          if (image.annotations && image.annotations.length > 0) {
            for (const annotation of image.annotations) {
              // 找到标注对应的缺陷类型ID
              let classId = 0;

              // 尝试从标签名称匹配缺陷类型
              if (annotation.label) {
                const matchedTypeIndex = dataset.defectTypes.findIndex(type =>
                  DEFECT_TYPE_LABELS[type] === annotation.label
                );
                if (matchedTypeIndex !== -1) {
                  classId = matchedTypeIndex;
                }
              }

              // 转换标注为YOLO格式 (class_id x_center y_center width height - 归一化坐标)
              if (annotation.type === 'bbox' && annotation.points.length >= 4) {
                let x_center, y_center, width, height;

                // 判断是否已经是归一化坐标 (0-1之间)
                const isNormalized = annotation.points.every(p => p >= 0 && p <= 1);

                if (isNormalized && annotation.points.length === 4) {
                  // 已经是 [x_center, y_center, width, height] 归一化格式
                  [x_center, y_center, width, height] = annotation.points;
                } else if (annotation.points.length === 4) {
                  // [x1, y1, x2, y2] 或 [x, y, w, h] 像素格式
                  const [p1, p2, p3, p4] = annotation.points;

                  if (p3 > p1 && p4 > p2) {
                    // [x1, y1, x2, y2] 格式
                    const x1 = p1 / image.width;
                    const y1 = p2 / image.height;
                    const x2 = p3 / image.width;
                    const y2 = p4 / image.height;
                    x_center = (x1 + x2) / 2;
                    y_center = (y1 + y2) / 2;
                    width = x2 - x1;
                    height = y2 - y1;
                  } else {
                    // [x, y, w, h] 格式
                    const x = p1 / image.width;
                    const y = p2 / image.height;
                    width = p3 / image.width;
                    height = p4 / image.height;
                    x_center = x + width / 2;
                    y_center = y + height / 2;
                  }
                }

                // 添加YOLO格式的标注行
                if (x_center !== undefined && y_center !== undefined && width !== undefined && height !== undefined) {
                  labelLines.push(`${classId} ${x_center.toFixed(6)} ${y_center.toFixed(6)} ${width.toFixed(6)} ${height.toFixed(6)}`);
                }
              } else if (annotation.type === 'polygon' && annotation.points.length >= 6) {
                // 多边形转换为边界框
                const xs = annotation.points.filter((_, i) => i % 2 === 0);
                const ys = annotation.points.filter((_, i) => i % 2 === 1);
                const minX = Math.min(...xs) / image.width;
                const maxX = Math.max(...xs) / image.width;
                const minY = Math.min(...ys) / image.height;
                const maxY = Math.max(...ys) / image.height;

                x_center = (minX + maxX) / 2;
                y_center = (minY + maxY) / 2;
                width = maxX - minX;
                height = maxY - minY;

                labelLines.push(`${classId} ${x_center.toFixed(6)} ${y_center.toFixed(6)} ${width.toFixed(6)} ${height.toFixed(6)}`);
              }
            }
          }

          // 创建标签文件（如果有标注数据）
          if (labelLines.length > 0) {
            const labelFilename = image.filename.replace(/\.[^.]+$/, '.txt');
            labelsFolder?.file(labelFilename, labelLines.join('\n'));
          }

          // 导出图片
          if (imagesFolder && image.url.startsWith('data:')) {
            const base64Data = image.url.split(',')[1];
            imagesFolder.file(image.filename, base64Data, { base64: true });
          }
        }
      } else {
        // COCO格式导出
        const cocoAnnotations: any[] = [];
        let annotationId = 1;

        // 构建图片列表和标注数据
        const cocoImages = images.map((img, idx) => ({
          id: idx + 1,
          file_name: img.filename,
          width: img.width,
          height: img.height
        }));

        // 遍历所有图片，提取标注数据
        images.forEach((image, imageIdx) => {
          const imageId = imageIdx + 1;

          if (image.annotations && image.annotations.length > 0) {
            for (const annotation of image.annotations) {
              // 找到标注对应的类别ID
              let categoryId = 1;

              // 尝试从标签名称匹配缺陷类型
              if (annotation.label) {
                const matchedTypeIndex = dataset.defectTypes.findIndex(type =>
                  DEFECT_TYPE_LABELS[type] === annotation.label
                );
                if (matchedTypeIndex !== -1) {
                  categoryId = matchedTypeIndex + 1;
                }
              }

              // 转换为COCO bbox格式 [x, y, width, height]
              if (annotation.type === 'bbox' && annotation.points.length >= 4) {
                let x, y, width, height;

                // 判断是否是归一化坐标
                const isNormalized = annotation.points.every(p => p >= 0 && p <= 1);

                if (isNormalized && annotation.points.length === 4) {
                  // [x_center, y_center, width, height] 归一化格式
                  const [cx, cy, w, h] = annotation.points;
                  x = (cx - w / 2) * image.width;
                  y = (cy - h / 2) * image.height;
                  width = w * image.width;
                  height = h * image.height;
                } else if (annotation.points.length === 4) {
                  const [p1, p2, p3, p4] = annotation.points;

                  if (p3 > p1 && p4 > p2) {
                    // [x1, y1, x2, y2] 格式
                    x = p1;
                    y = p2;
                    width = p3 - p1;
                    height = p4 - p2;
                  } else {
                    // [x, y, w, h] 格式
                    [x, y, width, height] = annotation.points;
                  }
                }

                // 添加COCO标注
                if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
                  cocoAnnotations.push({
                    id: annotationId++,
                    image_id: imageId,
                    category_id: categoryId,
                    bbox: [
                      Math.round(x * 100) / 100,
                      Math.round(y * 100) / 100,
                      Math.round(width * 100) / 100,
                      Math.round(height * 100) / 100
                    ],
                    area: Math.round(width * height * 100) / 100,
                    iscrowd: 0
                  });
                }
              } else if (annotation.type === 'polygon' && annotation.points.length >= 6) {
                // 多边形格式
                const segmentation = annotation.points.map((p, i) => {
                  // 如果是归一化坐标，转为像素坐标
                  if (p >= 0 && p <= 1) {
                    return i % 2 === 0 ? p * image.width : p * image.height;
                  }
                  return p;
                });

                // 计算边界框
                const xs = segmentation.filter((_, i) => i % 2 === 0);
                const ys = segmentation.filter((_, i) => i % 2 === 1);
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);

                cocoAnnotations.push({
                  id: annotationId++,
                  image_id: imageId,
                  category_id: categoryId,
                  segmentation: [segmentation],
                  bbox: [
                    Math.round(minX * 100) / 100,
                    Math.round(minY * 100) / 100,
                    Math.round((maxX - minX) * 100) / 100,
                    Math.round((maxY - minY) * 100) / 100
                  ],
                  area: Math.round((maxX - minX) * (maxY - minY) * 100) / 100,
                  iscrowd: 0
                });
              }
            }
          }
        });

        const cocoData = {
          info: {
            description: dataset.name,
            version: '1.0',
            year: new Date().getFullYear(),
            date_created: new Date().toISOString()
          },
          licenses: [],
          images: cocoImages,
          annotations: cocoAnnotations,
          categories: dataset.defectTypes.map((type, idx) => ({
            id: idx + 1,
            name: DEFECT_TYPE_LABELS[type],
            supercategory: 'defect'
          }))
        };

        zip.file('annotations.json', JSON.stringify(cocoData, null, 2));

        if (includeImages) {
          const imagesFolder = zip.folder('images');
          for (const image of images) {
            if (image.url.startsWith('data:')) {
              const base64Data = image.url.split(',')[1];
              imagesFolder?.file(image.filename, base64Data, { base64: true });
            }
          }
        }
      }
      
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${dataset.name}_${format}.zip`);
      
      onClose();
    } catch (err) {
      console.error('Export failed:', err);
      alert('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">导出数据集</h2>
          <p className="text-sm text-gray-500 mt-1">选择导出格式和选项</p>
        </div>
        
        <div className="p-6 space-y-5">
          {/* Format */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">导出格式</label>
            <div className="flex gap-3">
              <button
                onClick={() => setFormat(ExportFormat.YOLO)}
                className={`flex-1 px-4 py-3 rounded-lg border-2 transition-colors ${
                  format === ExportFormat.YOLO 
                    ? 'border-lx-gold bg-lx-gold/5' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium">YOLO</div>
                <div className="text-xs text-gray-500 mt-1">txt标签格式</div>
              </button>
              <button
                onClick={() => setFormat(ExportFormat.COCO)}
                className={`flex-1 px-4 py-3 rounded-lg border-2 transition-colors ${
                  format === ExportFormat.COCO 
                    ? 'border-lx-gold bg-lx-gold/5' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium">COCO</div>
                <div className="text-xs text-gray-500 mt-1">JSON标注格式</div>
              </button>
            </div>
          </div>
          
          {/* Options */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeImages}
                onChange={(e) => setIncludeImages(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-lx-gold focus:ring-lx-gold"
              />
              <span className="text-sm text-gray-700">包含图片文件</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyAnnotated}
                onChange={(e) => setOnlyAnnotated(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-lx-gold focus:ring-lx-gold"
              />
              <span className="text-sm text-gray-700">仅导出已标注图片</span>
            </label>
          </div>
          
          {/* Summary */}
          <div className="bg-gray-50 rounded-lg p-4 text-sm">
            <div className="text-gray-500">导出预览</div>
            <div className="mt-2 text-gray-900">
              将导出 <strong>{onlyAnnotated ? dataset.stats.annotatedImages : dataset.stats.totalImages}</strong> 张图片
              {includeImages && '（含图片文件）'}
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex-1 px-4 py-2.5 bg-lx-gold text-white rounded-lg hover:bg-lx-goldHover disabled:opacity-50"
          >
            {isExporting ? '导出中...' : '导出'}
          </button>
        </div>
      </div>
    </div>
  );
};

// 导入标注弹窗 - 支持ZIP包导入
const ImportAnnotationsModal: React.FC<{
  dataset: ReturnType<typeof useDatasetStore.getState>['datasets'][0];
  onClose: () => void;
}> = ({ dataset, onClose }) => {
  const { addImages, updateImageAnnotation } = useDatasetStore();
  const [importType, setImportType] = useState<'zip' | 'files'>('zip');
  const [isImporting, setIsImporting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [annotationFile, setAnnotationFile] = useState<File | null>(null);
  const [importLog, setImportLog] = useState<string[]>([]);

  const handleFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    setSelectedFiles(imageFiles);
  };

  const handleZipSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.zip')) {
      setZipFile(file);
    }
  };

  const handleAnnotationFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAnnotationFile(file);
    }
  };

  // 从ZIP包导入
  const handleZipImport = async () => {
    if (!zipFile) {
      alert('请选择ZIP文件');
      return;
    }

    setIsImporting(true);
    setImportLog([]);
    const logs: string[] = [];

    try {
      logs.push('正在解压ZIP文件...');
      setImportLog([...logs]);

      const zip = await JSZip.loadAsync(zipFile);
      
      // 查找图片文件
      const imageFiles: { name: string; data: Blob }[] = [];
      const annotationFiles: { name: string; content: string }[] = [];
      
      for (const [path, file] of Object.entries(zip.files) as [string, JSZip.JSZipObject][]) {
        if (file.dir) continue;
        
        const filename = path.split('/').pop() || '';
        const lowerPath = path.toLowerCase();
        
        // 图片文件 (支持多种目录结构)
        if (/\.(jpg|jpeg|png|webp|bmp)$/i.test(filename)) {
          const blob = await file.async('blob');
          imageFiles.push({ name: filename, data: blob });
        }
        // 标注JSON文件
        else if (filename.endsWith('.json') && !filename.startsWith('.')) {
          const content = await file.async('string');
          annotationFiles.push({ name: filename, content });
        }
      }

      logs.push(`找到 ${imageFiles.length} 张图片，${annotationFiles.length} 个标注文件`);
      setImportLog([...logs]);

      // 上传图片
      if (imageFiles.length > 0) {
        logs.push('正在处理图片...');
        setImportLog([...logs]);

        const newImages: Array<{
          filename: string;
          url: string;
          width: number;
          height: number;
        }> = [];

        for (const imgFile of imageFiles) {
          try {
            const url = await blobToDataURL(imgFile.data);
            const dimensions = await getImageDimensions(url);
            newImages.push({
              filename: imgFile.name,
              url,
              width: dimensions.width,
              height: dimensions.height
            });
          } catch (err) {
            logs.push(`⚠️ 处理图片失败: ${imgFile.name}`);
          }
        }

        if (newImages.length > 0) {
          addImages(dataset.id, newImages);
          logs.push(`✓ 已导入 ${newImages.length} 张图片`);
          setImportLog([...logs]);
        }
      }

      // 处理标注文件
      if (annotationFiles.length > 0) {
        logs.push('正在解析标注数据...');
        setImportLog([...logs]);

        // 建立文件名到标注数据的映射
        const annotationsMap = new Map<string, any[]>();
        
        for (const annFile of annotationFiles) {
          try {
            const data = JSON.parse(annFile.content);
            
            // 判断是单个图片的标注还是批量标注
            if (data.imageName || data.annotations) {
              // 单图片标注格式 (导出的JSON格式)
              const imageName = data.imageName || annFile.name.replace('_annotations.json', '.jpg');
              annotationsMap.set(imageName, data.annotations || []);
            } else if (data.images && data.annotations) {
              // COCO格式
              const imageIdToName = new Map<number, string>();
              data.images.forEach((img: any) => {
                imageIdToName.set(img.id, img.file_name);
              });
              
              data.annotations.forEach((ann: any) => {
                const imageName = imageIdToName.get(ann.image_id);
                if (imageName) {
                  const existing = annotationsMap.get(imageName) || [];
                  existing.push({
                    id: String(ann.id),
                    type: ann.segmentation ? 'polygon' : 'bbox',
                    points: ann.bbox || ann.segmentation?.[0] || [],
                    label: data.categories?.find((c: any) => c.id === ann.category_id)?.name || '缺陷',
                    color: '#ff6b6b'
                  });
                  annotationsMap.set(imageName, existing);
                }
              });
            }
          } catch (err) {
            logs.push(`⚠️ 解析标注文件失败: ${annFile.name}`);
          }
        }

        // 更新数据集中图片的标注
        let updatedCount = 0;
        const updatedDataset = useDatasetStore.getState().datasets.find(d => d.id === dataset.id);
        
        if (updatedDataset) {
          for (const img of updatedDataset.images) {
            const annotations = annotationsMap.get(img.filename);
            if (annotations && annotations.length > 0) {
              updateImageAnnotation(dataset.id, img.id, {
                isAnnotated: true,
                annotationCount: annotations.length,
                defectTypes: dataset.defectTypes.slice(0, 1),
                annotations: annotations.map((ann: any) => ({
                  id: ann.id || `ann-${Date.now()}-${Math.random()}`,
                  type: ann.type || 'bbox',
                  points: ann.points || [],
                  label: ann.label || '缺陷',
                  color: ann.color || '#ff6b6b',
                  locked: false,
                  visible: true
                }))
              });
              updatedCount++;
            }
          }
        }

        logs.push(`✓ 已恢复 ${updatedCount} 张图片的标注数据`);
        setImportLog([...logs]);
      }

      logs.push('✅ 导入完成！');
      setImportLog([...logs]);

      setTimeout(() => {
        onClose();
      }, 1500);

    } catch (err) {
      logs.push(`❌ 导入失败: ${err}`);
      setImportLog([...logs]);
    } finally {
      setIsImporting(false);
    }
  };

  // 从散文件导入
  const handleFilesImport = async () => {
    if (selectedFiles.length === 0) {
      alert('请选择图片文件');
      return;
    }

    setIsImporting(true);
    setImportLog([]);
    const logs: string[] = [];

    try {
      logs.push(`正在上传 ${selectedFiles.length} 张图片...`);
      setImportLog([...logs]);

      const newImages: Array<{
        filename: string;
        url: string;
        width: number;
        height: number;
      }> = [];

      for (const file of selectedFiles) {
        try {
          const url = await readFileAsDataURL(file);
          const dimensions = await getImageDimensions(url);
          newImages.push({
            filename: file.name,
            url,
            width: dimensions.width,
            height: dimensions.height
          });
        } catch (err) {
          logs.push(`⚠️ 加载图片失败: ${file.name}`);
        }
      }

      if (newImages.length > 0) {
        addImages(dataset.id, newImages);
        logs.push(`✓ 已上传 ${newImages.length} 张图片`);
        setImportLog([...logs]);
      }

      // 处理标注文件
      if (annotationFile) {
        logs.push('正在解析标注文件...');
        setImportLog([...logs]);

        const content = await readFileAsText(annotationFile);
        try {
          const data = JSON.parse(content);
          
          // 建立文件名到标注数据的映射
          const annotationsMap = new Map<string, any[]>();
          
          if (data.images && data.annotations) {
            // COCO格式
            const imageIdToName = new Map<number, string>();
            data.images.forEach((img: any) => {
              imageIdToName.set(img.id, img.file_name);
            });
            
            data.annotations.forEach((ann: any) => {
              const imageName = imageIdToName.get(ann.image_id);
              if (imageName) {
                const existing = annotationsMap.get(imageName) || [];
                const bbox = ann.bbox;
                existing.push({
                  id: String(ann.id),
                  type: 'bbox',
                  points: bbox ? [bbox[0], bbox[1], bbox[2], bbox[3]] : [],
                  label: data.categories?.find((c: any) => c.id === ann.category_id)?.name || '缺陷',
                  color: '#ff6b6b'
                });
                annotationsMap.set(imageName, existing);
              }
            });
          }

          // 更新数据集中图片的标注
          let updatedCount = 0;
          const updatedDataset = useDatasetStore.getState().datasets.find(d => d.id === dataset.id);
          
          if (updatedDataset) {
            for (const img of updatedDataset.images) {
              const annotations = annotationsMap.get(img.filename);
              if (annotations && annotations.length > 0) {
                updateImageAnnotation(dataset.id, img.id, {
                  isAnnotated: true,
                  annotationCount: annotations.length,
                  defectTypes: dataset.defectTypes.slice(0, 1),
                  annotations: annotations
                });
                updatedCount++;
              }
            }
          }

          logs.push(`✓ 已恢复 ${updatedCount} 张图片的标注数据`);
        } catch (err) {
          logs.push(`⚠️ 标注文件解析失败: ${err}`);
        }
        setImportLog([...logs]);
      }

      logs.push('✅ 导入完成！');
      setImportLog([...logs]);

      setTimeout(() => {
        onClose();
      }, 1500);

    } catch (err) {
      logs.push(`❌ 导入失败: ${err}`);
      setImportLog([...logs]);
    } finally {
      setIsImporting(false);
    }
  };

  const handleImport = () => {
    if (importType === 'zip') {
      handleZipImport();
    } else {
      handleFilesImport();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">导入标注数据</h2>
          <p className="text-sm text-gray-500 mt-1">导入已有的图片和标注数据继续标注</p>
        </div>
        
        <div className="p-6 space-y-5">
          {/* 导入方式选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">导入方式</label>
            <div className="flex gap-3">
              <button
                onClick={() => setImportType('zip')}
                className={`flex-1 px-4 py-3 rounded-lg border-2 transition-colors ${
                  importType === 'zip' 
                    ? 'border-lx-gold bg-lx-gold/5' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium">ZIP包导入</div>
                <div className="text-xs text-gray-500 mt-1">导入导出的完整数据包</div>
              </button>
              <button
                onClick={() => setImportType('files')}
                className={`flex-1 px-4 py-3 rounded-lg border-2 transition-colors ${
                  importType === 'files' 
                    ? 'border-lx-gold bg-lx-gold/5' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium">散文件导入</div>
                <div className="text-xs text-gray-500 mt-1">分别选择图片和标注</div>
              </button>
            </div>
          </div>

          {importType === 'zip' ? (
            /* ZIP文件选择 */
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ZIP数据包 <span className="text-red-500">*</span>
              </label>
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-lx-gold transition-colors">
                <input
                  type="file"
                  accept=".zip"
                  onChange={handleZipSelect}
                  className="hidden"
                  id="import-zip"
                />
                <label htmlFor="import-zip" className="cursor-pointer">
                  <FolderOpen className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">
                    {zipFile ? zipFile.name : '选择ZIP文件（包含图片和标注）'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    支持导出的标注数据包
                  </p>
                </label>
              </div>
            </div>
          ) : (
            <>
              {/* 图片文件选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  图片文件 <span className="text-red-500">*</span>
                </label>
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-lx-gold transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFilesSelect}
                    className="hidden"
                    id="import-images"
                  />
                  <label htmlFor="import-images" className="cursor-pointer">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {selectedFiles.length > 0 
                        ? `已选择 ${selectedFiles.length} 张图片` 
                        : '点击选择图片文件'}
                    </p>
                  </label>
                </div>
              </div>

              {/* 标注文件选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  标注文件（可选）
                </label>
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-lx-gold transition-colors">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleAnnotationFileSelect}
                    className="hidden"
                    id="import-annotations"
                  />
                  <label htmlFor="import-annotations" className="cursor-pointer">
                    <FolderOpen className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {annotationFile ? annotationFile.name : '选择标注JSON文件'}
                    </p>
                  </label>
                </div>
              </div>
            </>
          )}

          {/* 导入日志 */}
          {importLog.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4 text-sm max-h-40 overflow-y-auto font-mono">
              {importLog.map((log, idx) => (
                <div key={idx} className={`${log.startsWith('✓') || log.startsWith('✅') ? 'text-green-600' : log.startsWith('⚠️') || log.startsWith('❌') ? 'text-red-500' : 'text-gray-600'}`}>
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            disabled={isImporting}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleImport}
            disabled={isImporting || (importType === 'zip' ? !zipFile : selectedFiles.length === 0)}
            className="flex-1 px-4 py-2.5 bg-lx-gold text-white rounded-lg hover:bg-lx-goldHover disabled:opacity-50"
          >
            {isImporting ? '导入中...' : '开始导入'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper functions
const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = url;
  });
};

const blobToDataURL = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

