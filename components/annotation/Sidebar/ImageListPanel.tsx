import React from 'react';
import { useAnnotationStore } from '../annotationStore';
import { Trash2, Image as ImageIcon, CheckCircle, AlertCircle } from 'lucide-react';

type FilterType = 'all' | 'annotated' | 'unannotated' | 'abnormal';

const ImageListPanel: React.FC = () => {
    const { images, currentImageId, selectImage, removeImage, imageFilter, setImageFilter, getFilteredImages } = useAnnotationStore();
    
    const filteredImages = getFilteredImages();

    const filters: { id: FilterType; label: string }[] = [
        { id: 'all', label: '全部' },
        { id: 'annotated', label: '已标注' },
        { id: 'unannotated', label: '未标注' },
        { id: 'abnormal', label: '异常' },
    ];

    return (
        <div className="flex flex-col h-full">
            <div className="p-3 border-b border-gray-700">
                <h3 className="text-xs uppercase text-gray-400 tracking-wider mb-2">
                    图片列表 ({filteredImages.length}/{images.length})
                </h3>
                
                {/* 过滤按钮组 */}
                <div className="flex flex-wrap gap-1 bg-gray-900 p-1 rounded-lg">
                    {filters.map(filter => (
                        <button
                            key={filter.id}
                            onClick={() => setImageFilter(filter.id)}
                            className={`
                                px-2 py-1 rounded text-xs transition-all
                                ${imageFilter === filter.id 
                                    ? 'bg-lx-gold text-lx-black font-medium' 
                                    : 'text-gray-400 hover:bg-gray-700'}
                            `}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                <div className="flex flex-col gap-1">
                    {filteredImages.map((img) => {
                        const annotationCount = img.annotations.length + img.segmentationMasks.length;
                        const hasAnnotations = annotationCount > 0;
                        
                        return (
                            <div
                                key={img.id}
                                onClick={() => selectImage(img.id)}
                                className={`
                                    flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all
                                    ${currentImageId === img.id 
                                        ? 'bg-gray-700 border border-lx-gold' 
                                        : 'bg-transparent border border-transparent hover:bg-gray-800'}
                                `}
                            >
                                {/* 缩略图 */}
                                <div className="w-10 h-10 rounded overflow-hidden bg-black flex-shrink-0 relative">
                                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                                    
                                    {/* 标注数量徽章 */}
                                    {hasAnnotations && (
                                        <div className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-lx-gold text-lx-black text-[10px] font-semibold rounded-full flex items-center justify-center px-1">
                                            {annotationCount}
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate flex items-center gap-1 text-white">
                                        {img.name}
                                        {img.metadata.isAbnormal && (
                                            <AlertCircle size={12} className="text-red-500 flex-shrink-0" />
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-500 flex items-center gap-1">
                                        {hasAnnotations ? (
                                            <>
                                                <CheckCircle size={10} className="text-green-500" />
                                                {img.annotations.length} 标注
                                                {img.segmentationMasks.length > 0 && `, ${img.segmentationMasks.length} 掩码`}
                                            </>
                                        ) : (
                                            <span className="opacity-60">未标注</span>
                                        )}
                                    </div>
                                </div>

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeImage(img.id);
                                    }}
                                    className="text-gray-500 p-1 opacity-50 hover:opacity-100 hover:text-red-500 transition-all"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        );
                    })}

                    {filteredImages.length === 0 && images.length > 0 && (
                        <div className="flex flex-col items-center justify-center p-10 text-gray-500 text-center gap-2">
                            <span className="text-sm">没有符合条件的图片</span>
                        </div>
                    )}

                    {images.length === 0 && (
                        <div className="flex flex-col items-center justify-center p-10 text-gray-500 text-center gap-2">
                            <ImageIcon size={32} className="opacity-50" />
                            <span className="text-sm">请加载图片</span>
                            <span className="text-xs opacity-70">点击顶部"加载图片"按钮</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImageListPanel;

