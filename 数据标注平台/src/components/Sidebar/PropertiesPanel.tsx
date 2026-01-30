import React, { useState, useMemo } from 'react';
import { useAppStore, DEFECT_TEMPLATES, PRESET_COLORS } from '../../store/useAppStore';
import { Trash2, Tag, Lock, Unlock, Eye, EyeOff, Search, SlidersHorizontal, ChevronDown, ChevronRight } from 'lucide-react';

const PropertiesPanel: React.FC = () => {
    const {
        getCurrentImage,
        setMetadata,
        selectedAnnotationId,
        setSelectedAnnotationId,
        selectedMaskId,
        setSelectedMaskId,
        updateAnnotation,
        removeAnnotation,
        updateMask,
        removeMask,
        currentClassId,
        setCurrentClassId,
        brushSize,
        setBrushSize,
        selectedTool,
        toggleAnnotationLock,
        toggleMaskLock,
        getAllLabels,
        hiddenLabels,
        toggleLabelVisibility,
        selectedAnnotationIds,
        toggleAnnotationSelection,
        batchUpdateAnnotations,
        deleteSelectedAnnotations,
        imageAdjustments,
        setImageAdjustments
    } = useAppStore();

    const [searchTerm, setSearchTerm] = useState('');
    const [showAdjustments, setShowAdjustments] = useState(false);
    const [batchLabel, setBatchLabel] = useState('');
    const [showAnnotations, setShowAnnotations] = useState(true);
    const [showMasks, setShowMasks] = useState(true);
    const [showLabelsVisibility, setShowLabelsVisibility] = useState(false);

    const currentImage = getCurrentImage();
    const allLabels = getAllLabels();

    const filteredAnnotations = useMemo(() => {
        if (!currentImage) return [];
        if (!searchTerm) return currentImage.annotations;
        return currentImage.annotations.filter(ann => 
            ann.label.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [currentImage, searchTerm]);

    if (!currentImage) {
        return (
            <div style={{ padding: '20px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                未选择图片
            </div>
        );
    }

    const { metadata, annotations, segmentationMasks } = currentImage;
    const selectedAnnotation = annotations.find(a => a.id === selectedAnnotationId);
    const selectedMask = segmentationMasks.find(m => m.id === selectedMaskId);

    const applyTemplate = (template: typeof DEFECT_TEMPLATES[0]) => {
        if (selectedAnnotation) {
            updateAnnotation(selectedAnnotation.id, { label: template.label, color: template.color });
        }
    };

    const applyMaskTemplate = (template: typeof DEFECT_TEMPLATES[0]) => {
        if (selectedMask) {
            updateMask(selectedMask.id, { label: template.label, color: template.color });
        }
    };

    const handleBatchUpdate = () => {
        if (selectedAnnotationIds.length > 0 && batchLabel) {
            batchUpdateAnnotations(selectedAnnotationIds, { label: batchLabel });
            setBatchLabel('');
        }
    };

    // 可折叠的区块标题
    const SectionHeader = ({ 
        title, 
        count, 
        isOpen, 
        onToggle 
    }: { 
        title: string; 
        count?: number; 
        isOpen: boolean; 
        onToggle: () => void;
    }) => (
        <button
            onClick={onToggle}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '8px 0',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: 'pointer'
            }}
        >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {title}
                {count !== undefined && <span style={{ color: 'var(--accent-primary)' }}>({count})</span>}
            </span>
        </button>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 图片属性 */}
            <div style={{ padding: '12px 15px', borderBottom: '1px solid var(--border-color)' }}>
                <h3 style={{ marginBottom: '10px', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                    图片属性
                </h3>

                <div style={{ marginBottom: '10px' }}>
                    <input
                        type="text"
                        value={metadata.partType}
                        onChange={(e) => setMetadata({ partType: e.target.value })}
                        placeholder="零件类型..."
                        style={{
                            width: '100%',
                            padding: '6px 10px',
                            backgroundColor: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            color: 'var(--text-primary)',
                            outline: 'none',
                            fontSize: '0.85rem'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                        <input
                            type="checkbox"
                            checked={metadata.isAbnormal}
                            onChange={(e) => setMetadata({ isAbnormal: e.target.checked })}
                            style={{ width: '14px', height: '14px', accentColor: 'var(--danger)' }}
                        />
                        异常 (NG)
                    </label>
                    
                    <button
                        onClick={() => setShowAdjustments(!showAdjustments)}
                        className="btn-icon"
                        style={{ 
                            padding: '4px',
                            backgroundColor: showAdjustments ? 'var(--accent-primary)' : 'transparent',
                            color: showAdjustments ? 'white' : 'var(--text-secondary)'
                        }}
                        title="图片调整"
                    >
                        <SlidersHorizontal size={14} />
                    </button>
                </div>

                {showAdjustments && (
                    <div style={{ marginTop: '10px', padding: '10px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px' }}>
                        <div style={{ marginBottom: '8px' }}>
                            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                                <span>亮度</span><span>{imageAdjustments.brightness}%</span>
                            </label>
                            <input type="range" min="50" max="150" value={imageAdjustments.brightness}
                                onChange={(e) => setImageAdjustments({ ...imageAdjustments, brightness: parseInt(e.target.value) })}
                                style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                                <span>对比度</span><span>{imageAdjustments.contrast}%</span>
                            </label>
                            <input type="range" min="50" max="150" value={imageAdjustments.contrast}
                                onChange={(e) => setImageAdjustments({ ...imageAdjustments, contrast: parseInt(e.target.value) })}
                                style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                        </div>
                        <button onClick={() => setImageAdjustments({ brightness: 100, contrast: 100 })}
                            style={{ padding: '3px 8px', fontSize: '0.7rem', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderRadius: '4px' }}>
                            重置
                        </button>
                    </div>
                )}
            </div>

            {/* 分割设置 */}
            <div style={{ padding: '12px 15px', borderBottom: '1px solid var(--border-color)' }}>
                <h3 style={{ marginBottom: '10px', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                    分割设置
                </h3>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem' }}>类别ID</label>
                        <input type="number" min="1" max="255" value={currentClassId}
                            onChange={(e) => setCurrentClassId(parseInt(e.target.value) || 1)}
                            style={{ width: '100%', padding: '6px 8px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.75rem' }}>
                            <span>画笔</span><span>{brushSize}px</span>
                        </label>
                        <input type="range" min="1" max="100" value={brushSize}
                            onChange={(e) => setBrushSize(parseInt(e.target.value))}
                            style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                    </div>
                </div>
            </div>

            {/* 标签可见性 - 可折叠 */}
            {allLabels.length > 0 && (
                <div style={{ padding: '8px 15px', borderBottom: '1px solid var(--border-color)' }}>
                    <SectionHeader 
                        title="标签可见性" 
                        count={allLabels.length} 
                        isOpen={showLabelsVisibility} 
                        onToggle={() => setShowLabelsVisibility(!showLabelsVisibility)} 
                    />
                    {showLabelsVisibility && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', paddingBottom: '8px' }}>
                            {allLabels.map(label => (
                                <button key={label} onClick={() => toggleLabelVisibility(label)}
                                    style={{
                                        padding: '3px 8px', fontSize: '0.75rem', borderRadius: '4px',
                                        backgroundColor: hiddenLabels.includes(label) ? 'var(--bg-primary)' : 'var(--bg-tertiary)',
                                        color: hiddenLabels.includes(label) ? 'var(--text-secondary)' : 'var(--text-primary)',
                                        opacity: hiddenLabels.includes(label) ? 0.5 : 1,
                                        display: 'flex', alignItems: 'center', gap: '3px'
                                    }}>
                                    {hiddenLabels.includes(label) ? <EyeOff size={10} /> : <Eye size={10} />}
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 标注列表 - 可折叠 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <SectionHeader 
                        title="标注" 
                        count={annotations.length} 
                        isOpen={showAnnotations} 
                        onToggle={() => setShowAnnotations(!showAnnotations)} 
                    />
                    {selectedAnnotationIds.length > 0 && (
                        <button onClick={deleteSelectedAnnotations}
                            style={{ padding: '3px 6px', fontSize: '0.7rem', backgroundColor: 'var(--danger)', color: 'white', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Trash2 size={10} /> {selectedAnnotationIds.length}
                        </button>
                    )}
                </div>

                {showAnnotations && (
                    <>
                        {/* 搜索框 */}
                        <div style={{ position: 'relative', marginBottom: '8px' }}>
                            <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="搜索..."
                                style={{ width: '100%', padding: '6px 10px 6px 28px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                        </div>

                        {selectedAnnotationIds.length > 0 && (
                            <div style={{ marginBottom: '8px', padding: '8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '6px', display: 'flex', gap: '6px' }}>
                                <input type="text" value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} placeholder="批量修改..." list="labels"
                                    style={{ flex: 1, padding: '4px 8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                                <button onClick={handleBatchUpdate} disabled={!batchLabel}
                                    style={{ padding: '4px 10px', backgroundColor: 'var(--accent-primary)', color: 'white', borderRadius: '4px', fontSize: '0.75rem', opacity: batchLabel ? 1 : 0.5 }}>
                                    应用
                                </button>
                            </div>
                        )}

                        <datalist id="labels">
                            {allLabels.map(label => <option key={label} value={label} />)}
                        </datalist>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {filteredAnnotations.map((ann) => {
                                const isHidden = hiddenLabels.includes(ann.label);
                                const isSelected = selectedAnnotationIds.includes(ann.id);
                                
                                return (
                                    <div key={ann.id}
                                        onClick={(e) => {
                                            if (e.shiftKey || e.ctrlKey || e.metaKey) { toggleAnnotationSelection(ann.id); }
                                            else { setSelectedAnnotationId(ann.id); }
                                        }}
                                        style={{
                                            padding: '6px 8px', borderRadius: '4px', cursor: 'pointer',
                                            backgroundColor: (selectedAnnotationId === ann.id || isSelected) ? 'var(--bg-tertiary)' : 'transparent',
                                            border: `1px solid ${selectedAnnotationId === ann.id ? 'var(--accent-primary)' : isSelected ? 'var(--warning)' : 'var(--border-color)'}`,
                                            opacity: isHidden ? 0.5 : 1
                                        }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: ann.color }} />
                                                <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{ann.label || '未标记'}</span>
                                                {ann.locked && <Lock size={10} style={{ color: 'var(--warning)' }} />}
                                            </div>
                                            <div style={{ display: 'flex', gap: '2px' }}>
                                                <button onClick={(e) => { e.stopPropagation(); toggleAnnotationLock(ann.id); }} style={{ padding: '2px', color: 'var(--text-secondary)' }}>
                                                    {ann.locked ? <Lock size={10} /> : <Unlock size={10} />}
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); if (!ann.locked) removeAnnotation(ann.id); }}
                                                    style={{ padding: '2px', color: ann.locked ? 'var(--text-secondary)' : 'var(--danger)', opacity: ann.locked ? 0.3 : 1 }} disabled={ann.locked}>
                                                    <Trash2 size={10} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {filteredAnnotations.length === 0 && annotations.length > 0 && (
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', padding: '10px' }}>无匹配</div>
                            )}
                            {annotations.length === 0 && (
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', padding: '10px' }}>暂无标注</div>
                            )}
                        </div>
                    </>
                )}

                {/* 分割掩码列表 - 可折叠 */}
                <div style={{ marginTop: '12px' }}>
                    <SectionHeader 
                        title="分割掩码" 
                        count={segmentationMasks.length} 
                        isOpen={showMasks} 
                        onToggle={() => setShowMasks(!showMasks)} 
                    />
                    
                    {showMasks && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {segmentationMasks.map((mask) => (
                                <div key={mask.id} onClick={() => setSelectedMaskId(mask.id)}
                                    style={{
                                        padding: '6px 8px', borderRadius: '4px', cursor: 'pointer',
                                        backgroundColor: selectedMaskId === mask.id ? 'var(--bg-tertiary)' : 'transparent',
                                        border: `1px solid ${selectedMaskId === mask.id ? 'var(--accent-primary)' : 'var(--border-color)'}`
                                    }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: mask.color }} />
                                            <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{mask.label || '未标记'}</span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>#{mask.classId}</span>
                                            {mask.locked && <Lock size={10} style={{ color: 'var(--warning)' }} />}
                                        </div>
                                        <div style={{ display: 'flex', gap: '2px' }}>
                                            <button onClick={(e) => { e.stopPropagation(); toggleMaskLock(mask.id); }} style={{ padding: '2px', color: 'var(--text-secondary)' }}>
                                                {mask.locked ? <Lock size={10} /> : <Unlock size={10} />}
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); if (!mask.locked) removeMask(mask.id); }}
                                                style={{ padding: '2px', color: mask.locked ? 'var(--text-secondary)' : 'var(--danger)', opacity: mask.locked ? 0.3 : 1 }} disabled={mask.locked}>
                                                <Trash2 size={10} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {segmentationMasks.length === 0 && (
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', padding: '10px' }}>暂无掩码</div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 编辑选中的标注 */}
            {selectedAnnotation && (
                <div style={{ padding: '12px 15px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)', maxHeight: '280px', overflowY: 'auto' }}>
                    <h3 style={{ marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600 }}>编辑标注</h3>
                    
                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            <Tag size={10} /> 缺陷类型
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '80px', overflowY: 'auto' }}>
                            {DEFECT_TEMPLATES.map((template) => (
                                <button key={template.label} onClick={() => applyTemplate(template)}
                                    style={{
                                        padding: '3px 8px', fontSize: '0.75rem', borderRadius: '4px',
                                        backgroundColor: selectedAnnotation.label === template.label ? template.color : 'var(--bg-primary)',
                                        color: selectedAnnotation.label === template.label ? 'white' : 'var(--text-primary)',
                                        border: `1px solid ${template.color}`
                                    }}>
                                    {template.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div style={{ marginBottom: '8px' }}>
                        <input type="text" value={selectedAnnotation.label}
                            onChange={(e) => updateAnnotation(selectedAnnotation.id, { label: e.target.value })}
                            placeholder="自定义类型..." list="labels"
                            style={{ width: '100%', padding: '6px 10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
                    </div>
                    
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>颜色</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {PRESET_COLORS.map((color) => (
                                <button key={color} onClick={() => updateAnnotation(selectedAnnotation.id, { color })}
                                    style={{ width: '20px', height: '20px', borderRadius: '4px', backgroundColor: color, border: selectedAnnotation.color === color ? '2px solid white' : 'none' }} />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 编辑选中的掩码 - 添加缺陷类型选择 */}
            {selectedMask && !selectedAnnotation && (
                <div style={{ padding: '12px 15px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)', maxHeight: '280px', overflowY: 'auto' }}>
                    <h3 style={{ marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600 }}>编辑掩码</h3>
                    
                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            <Tag size={10} /> 缺陷类型
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '80px', overflowY: 'auto' }}>
                            {DEFECT_TEMPLATES.map((template) => (
                                <button key={template.label} onClick={() => applyMaskTemplate(template)}
                                    style={{
                                        padding: '3px 8px', fontSize: '0.75rem', borderRadius: '4px',
                                        backgroundColor: selectedMask.label === template.label ? template.color : 'var(--bg-primary)',
                                        color: selectedMask.label === template.label ? 'white' : 'var(--text-primary)',
                                        border: `1px solid ${template.color}`
                                    }}>
                                    {template.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <div style={{ flex: 2 }}>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>标签</label>
                            <input type="text" value={selectedMask.label}
                                onChange={(e) => updateMask(selectedMask.id, { label: e.target.value })}
                                placeholder="自定义..."
                                style={{ width: '100%', padding: '6px 10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>类别ID</label>
                            <input type="number" min="1" max="255" value={selectedMask.classId}
                                onChange={(e) => updateMask(selectedMask.id, { classId: parseInt(e.target.value) || 1 })}
                                style={{ width: '100%', padding: '6px 10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
                        </div>
                    </div>
                    
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>颜色</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {PRESET_COLORS.map((color) => (
                                <button key={color} onClick={() => updateMask(selectedMask.id, { color })}
                                    style={{ width: '20px', height: '20px', borderRadius: '4px', backgroundColor: color, border: selectedMask.color === color ? '2px solid white' : 'none' }} />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PropertiesPanel;
