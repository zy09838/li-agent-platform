import React from 'react';
import { useAnnotationStore } from '../../store/useAnnotationStore';
import { Trash2, Image as ImageIcon, CheckCircle, AlertCircle } from 'lucide-react';

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
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '15px', borderBottom: `1px solid ${THEME.borderColor}` }}>
                <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: THEME.textSecondary, letterSpacing: '0.05em', marginBottom: '10px' }}>
                    图片列表 ({filteredImages.length}/{images.length})
                </h3>
                
                {/* 过滤按钮组 */}
                <div style={{ 
                    display: 'flex', 
                    gap: '4px', 
                    flexWrap: 'wrap',
                    backgroundColor: THEME.bgPrimary,
                    padding: '4px',
                    borderRadius: '8px'
                }}>
                    {filters.map(filter => (
                        <button
                            key={filter.id}
                            onClick={() => setImageFilter(filter.id)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                color: imageFilter === filter.id ? '#1a1a1a' : THEME.textSecondary,
                                backgroundColor: imageFilter === filter.id ? THEME.accentGold : 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {filteredImages.map((img) => {
                        const annotationCount = img.annotations.length + img.segmentationMasks.length;
                        const hasAnnotations = annotationCount > 0;
                        
                        return (
                            <div
                                key={img.id}
                                onClick={() => selectImage(img.id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '8px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    backgroundColor: currentImageId === img.id ? THEME.bgTertiary : 'transparent',
                                    border: `1px solid ${currentImageId === img.id ? THEME.accentGold : 'transparent'}`,
                                    transition: 'all 0.15s'
                                }}
                            >
                                {/* 缩略图 */}
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '4px',
                                    overflow: 'hidden',
                                    backgroundColor: '#000',
                                    flexShrink: 0,
                                    position: 'relative'
                                }}>
                                    <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    
                                    {/* 标注数量徽章 */}
                                    {hasAnnotations && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '-4px',
                                            right: '-4px',
                                            minWidth: '16px',
                                            height: '16px',
                                            background: THEME.accentGold,
                                            color: '#1a1a1a',
                                            fontSize: '0.65rem',
                                            fontWeight: 600,
                                            borderRadius: '8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            padding: '0 4px'
                                        }}>
                                            {annotationCount}
                                        </div>
                                    )}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ 
                                        fontSize: '0.85rem', 
                                        fontWeight: 500, 
                                        whiteSpace: 'nowrap', 
                                        overflow: 'hidden', 
                                        textOverflow: 'ellipsis',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        color: THEME.textPrimary
                                    }}>
                                        {img.name}
                                        {img.metadata.isAbnormal && (
                                            <AlertCircle size={12} style={{ color: THEME.danger, flexShrink: 0 }} />
                                        )}
                                    </div>
                                    <div style={{ 
                                        fontSize: '0.75rem', 
                                        color: THEME.textSecondary,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        {hasAnnotations ? (
                                            <>
                                                <CheckCircle size={10} style={{ color: THEME.success }} />
                                                {img.annotations.length} 标注
                                                {img.segmentationMasks.length > 0 && `, ${img.segmentationMasks.length} 掩码`}
                                            </>
                                        ) : (
                                            <span style={{ opacity: 0.6 }}>未标注</span>
                                        )}
                                    </div>
                                </div>

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeImage(img.id);
                                    }}
                                    style={{
                                        color: THEME.textSecondary,
                                        padding: '4px',
                                        opacity: 0.5,
                                        transition: 'opacity 0.15s',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        );
                    })}

                    {filteredImages.length === 0 && images.length > 0 && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '40px 20px',
                            color: THEME.textSecondary,
                            textAlign: 'center',
                            gap: '10px'
                        }}>
                            <span style={{ fontSize: '0.9rem' }}>没有符合条件的图片</span>
                        </div>
                    )}

                    {images.length === 0 && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '40px 20px',
                            color: THEME.textSecondary,
                            textAlign: 'center',
                            gap: '10px'
                        }}>
                            <ImageIcon size={32} style={{ opacity: 0.5 }} />
                            <span style={{ fontSize: '0.9rem' }}>请加载图片</span>
                            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>点击顶部"加载图片"按钮</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImageListPanel;

