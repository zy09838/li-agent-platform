import React, { useState, useMemo, useCallback } from 'react';
import { useAnnotationStore, PRESET_COLORS, getDefectTemplates, addCustomDefectTemplate, removeCustomDefectTemplate, DefectTemplate } from '../annotationStore';
import { Trash2, Tag, Lock, Unlock, Eye, EyeOff, Search, SlidersHorizontal, ChevronDown, ChevronRight, Plus, X } from 'lucide-react';

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
    } = useAnnotationStore();

    const [searchTerm, setSearchTerm] = useState('');
    const [showAdjustments, setShowAdjustments] = useState(false);
    const [batchLabel, setBatchLabel] = useState('');
    const [showAnnotations, setShowAnnotations] = useState(true);
    const [showMasks, setShowMasks] = useState(true);
    const [showLabelsVisibility, setShowLabelsVisibility] = useState(false);
    
    // 自定义缺陷类型相关状态
    const [defectTemplates, setDefectTemplates] = useState<DefectTemplate[]>(getDefectTemplates());
    const [showAddDefect, setShowAddDefect] = useState(false);
    const [newDefectLabel, setNewDefectLabel] = useState('');
    const [newDefectColor, setNewDefectColor] = useState(PRESET_COLORS[0]);

    // 刷新缺陷类型列表
    const refreshDefectTemplates = useCallback(() => {
        setDefectTemplates(getDefectTemplates());
    }, []);

    // 添加新缺陷类型
    const handleAddDefectType = () => {
        if (!newDefectLabel.trim()) return;
        const success = addCustomDefectTemplate(newDefectLabel.trim(), newDefectColor);
        if (success) {
            refreshDefectTemplates();
            setNewDefectLabel('');
            setShowAddDefect(false);
        } else {
            alert('该缺陷类型已存在');
        }
    };

    // 删除自定义缺陷类型
    const handleRemoveDefectType = (label: string) => {
        if (confirm(`确定要删除缺陷类型"${label}"吗？`)) {
            removeCustomDefectTemplate(label);
            refreshDefectTemplates();
        }
    };

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
            <div className="p-5 text-gray-500 text-center">
                未选择图片
            </div>
        );
    }

    const { metadata, annotations, segmentationMasks } = currentImage;
    const selectedAnnotation = annotations.find(a => a.id === selectedAnnotationId);
    const selectedMask = segmentationMasks.find(m => m.id === selectedMaskId);

    const applyTemplate = (template: DefectTemplate) => {
        if (selectedAnnotation) {
            updateAnnotation(selectedAnnotation.id, { label: template.label, color: template.color });
        }
    };

    const applyMaskTemplate = (template: DefectTemplate) => {
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
            className="flex items-center justify-between w-full py-2 bg-transparent text-gray-400 text-xs uppercase tracking-wider cursor-pointer"
        >
            <span className="flex items-center gap-1.5">
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {title}
                {count !== undefined && <span className="text-lx-gold">({count})</span>}
            </span>
        </button>
    );

    return (
        <div className="flex flex-col h-full text-white">
            {/* 图片属性 */}
            <div className="p-3 border-b border-gray-700">
                <h3 className="mb-2 text-xs uppercase text-gray-400 tracking-wider">
                    图片属性
                </h3>

                <div className="mb-2">
                    <input
                        type="text"
                        value={metadata.partType}
                        onChange={(e) => setMetadata({ partType: e.target.value })}
                        placeholder="零件类型..."
                        className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:border-lx-gold focus:outline-none"
                    />
                </div>

                <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                        <input
                            type="checkbox"
                            checked={metadata.isAbnormal}
                            onChange={(e) => setMetadata({ isAbnormal: e.target.checked })}
                            className="w-3.5 h-3.5 accent-red-500"
                        />
                        异常 (NG)
                    </label>
                    
                    <button
                        onClick={() => setShowAdjustments(!showAdjustments)}
                        className={`p-1 rounded transition-colors ${showAdjustments ? 'bg-lx-gold text-lx-black' : 'text-gray-400 hover:bg-gray-700'}`}
                        title="图片调整"
                    >
                        <SlidersHorizontal size={14} />
                    </button>
                </div>

                {showAdjustments && (
                    <div className="mt-2 p-2 bg-gray-900 rounded-lg">
                        <div className="mb-2">
                            <label className="flex justify-between text-[10px] mb-1 text-gray-400">
                                <span>亮度</span><span>{imageAdjustments.brightness}%</span>
                            </label>
                            <input type="range" min="50" max="150" value={imageAdjustments.brightness}
                                onChange={(e) => setImageAdjustments({ ...imageAdjustments, brightness: parseInt(e.target.value) })}
                                className="w-full accent-lx-gold" />
                        </div>
                        <div className="mb-2">
                            <label className="flex justify-between text-[10px] mb-1 text-gray-400">
                                <span>对比度</span><span>{imageAdjustments.contrast}%</span>
                            </label>
                            <input type="range" min="50" max="150" value={imageAdjustments.contrast}
                                onChange={(e) => setImageAdjustments({ ...imageAdjustments, contrast: parseInt(e.target.value) })}
                                className="w-full accent-lx-gold" />
                        </div>
                        <button onClick={() => setImageAdjustments({ brightness: 100, contrast: 100 })}
                            className="px-2 py-1 text-[10px] bg-gray-800 text-gray-400 rounded hover:bg-gray-700">
                            重置
                        </button>
                    </div>
                )}
            </div>

            {/* 分割设置 */}
            <div className="p-3 border-b border-gray-700">
                <h3 className="mb-2 text-xs uppercase text-gray-400 tracking-wider">
                    分割设置
                </h3>
                <div className="flex gap-2">
                    <div className="flex-1">
                        <label className="block mb-1 text-[10px] text-gray-400">类别ID</label>
                        <input type="number" min="1" max="255" value={currentClassId}
                            onChange={(e) => setCurrentClassId(parseInt(e.target.value) || 1)}
                            className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:border-lx-gold focus:outline-none" />
                    </div>
                    <div className="flex-1">
                        <label className="flex justify-between mb-1 text-[10px] text-gray-400">
                            <span>画笔</span><span>{brushSize}px</span>
                        </label>
                        <input type="range" min="1" max="100" value={brushSize}
                            onChange={(e) => setBrushSize(parseInt(e.target.value))}
                            className="w-full accent-lx-gold" />
                    </div>
                </div>
            </div>

            {/* 标签可见性 - 可折叠 */}
            {allLabels.length > 0 && (
                <div className="px-3 py-2 border-b border-gray-700">
                    <SectionHeader 
                        title="标签可见性" 
                        count={allLabels.length} 
                        isOpen={showLabelsVisibility} 
                        onToggle={() => setShowLabelsVisibility(!showLabelsVisibility)} 
                    />
                    {showLabelsVisibility && (
                        <div className="flex flex-wrap gap-1 pb-2">
                            {allLabels.map(label => (
                                <button key={label} onClick={() => toggleLabelVisibility(label)}
                                    className={`px-2 py-0.5 text-[10px] rounded flex items-center gap-1 transition-all
                                        ${hiddenLabels.includes(label) 
                                            ? 'bg-gray-900 text-gray-500 opacity-50' 
                                            : 'bg-gray-700 text-white'}`}>
                                    {hiddenLabels.includes(label) ? <EyeOff size={10} /> : <Eye size={10} />}
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 标注列表 - 可折叠 */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
                <div className="flex justify-between items-center">
                    <SectionHeader 
                        title="标注" 
                        count={annotations.length} 
                        isOpen={showAnnotations} 
                        onToggle={() => setShowAnnotations(!showAnnotations)} 
                    />
                    {selectedAnnotationIds.length > 0 && (
                        <button onClick={deleteSelectedAnnotations}
                            className="px-1.5 py-0.5 text-[10px] bg-red-600 text-white rounded flex items-center gap-1">
                            <Trash2 size={10} /> {selectedAnnotationIds.length}
                        </button>
                    )}
                </div>

                {showAnnotations && (
                    <>
                        {/* 搜索框 */}
                        <div className="relative mb-2">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="搜索..."
                                className="w-full pl-7 pr-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:border-lx-gold focus:outline-none" />
                        </div>

                        {selectedAnnotationIds.length > 0 && (
                            <div className="mb-2 p-2 bg-gray-800 rounded flex gap-1.5">
                                <input type="text" value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} placeholder="批量修改..."
                                    list="labels"
                                    className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-xs focus:border-lx-gold focus:outline-none" />
                                <button onClick={handleBatchUpdate} disabled={!batchLabel}
                                    className={`px-2 py-1 rounded text-[10px] ${batchLabel ? 'bg-lx-gold text-lx-black' : 'bg-gray-700 text-gray-500'}`}>
                                    应用
                                </button>
                            </div>
                        )}

                        <datalist id="labels">
                            {allLabels.map(label => <option key={label} value={label} />)}
                        </datalist>

                        <div className="flex flex-col gap-1">
                            {filteredAnnotations.map((ann) => {
                                const isHidden = hiddenLabels.includes(ann.label);
                                const isSelected = selectedAnnotationIds.includes(ann.id);
                                
                                return (
                                    <div key={ann.id}
                                        onClick={(e) => {
                                            if (e.shiftKey || e.ctrlKey || e.metaKey) { toggleAnnotationSelection(ann.id); }
                                            else { setSelectedAnnotationId(ann.id); }
                                        }}
                                        className={`p-1.5 rounded cursor-pointer transition-all
                                            ${selectedAnnotationId === ann.id || isSelected ? 'bg-gray-700' : 'bg-transparent hover:bg-gray-800'}
                                            ${selectedAnnotationId === ann.id ? 'border border-lx-gold' : isSelected ? 'border border-yellow-500' : 'border border-gray-700'}
                                            ${isHidden ? 'opacity-50' : ''}`}>
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: ann.color }} />
                                                <span className="text-xs font-medium">{ann.label || '未标记'}</span>
                                                {ann.locked && <Lock size={10} className="text-yellow-500" />}
                                            </div>
                                            <div className="flex gap-0.5">
                                                <button onClick={(e) => { e.stopPropagation(); toggleAnnotationLock(ann.id); }} className="p-0.5 text-gray-500 hover:text-white">
                                                    {ann.locked ? <Lock size={10} /> : <Unlock size={10} />}
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); if (!ann.locked) removeAnnotation(ann.id); }}
                                                    className={`p-0.5 ${ann.locked ? 'text-gray-600' : 'text-red-500 hover:text-red-400'}`} disabled={ann.locked}>
                                                    <Trash2 size={10} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {filteredAnnotations.length === 0 && annotations.length > 0 && (
                                <div className="text-gray-500 text-xs text-center py-2">无匹配</div>
                            )}
                            {annotations.length === 0 && (
                                <div className="text-gray-500 text-xs text-center py-2">暂无标注</div>
                            )}
                        </div>
                    </>
                )}

                {/* 分割掩码列表 - 可折叠 */}
                <div className="mt-3">
                    <SectionHeader 
                        title="分割掩码" 
                        count={segmentationMasks.length} 
                        isOpen={showMasks} 
                        onToggle={() => setShowMasks(!showMasks)} 
                    />
                    
                    {showMasks && (
                        <div className="flex flex-col gap-1">
                            {segmentationMasks.map((mask) => (
                                <div key={mask.id} onClick={() => setSelectedMaskId(mask.id)}
                                    className={`p-1.5 rounded cursor-pointer transition-all
                                        ${selectedMaskId === mask.id ? 'bg-gray-700 border border-lx-gold' : 'bg-transparent border border-gray-700 hover:bg-gray-800'}`}>
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: mask.color }} />
                                            <span className="text-xs font-medium">{mask.label || '未标记'}</span>
                                            <span className="text-[10px] text-gray-500">#{mask.classId}</span>
                                            {mask.locked && <Lock size={10} className="text-yellow-500" />}
                                        </div>
                                        <div className="flex gap-0.5">
                                            <button onClick={(e) => { e.stopPropagation(); toggleMaskLock(mask.id); }} className="p-0.5 text-gray-500 hover:text-white">
                                                {mask.locked ? <Lock size={10} /> : <Unlock size={10} />}
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); if (!mask.locked) removeMask(mask.id); }}
                                                className={`p-0.5 ${mask.locked ? 'text-gray-600' : 'text-red-500 hover:text-red-400'}`} disabled={mask.locked}>
                                                <Trash2 size={10} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {segmentationMasks.length === 0 && (
                                <div className="text-gray-500 text-xs text-center py-2">暂无掩码</div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 编辑选中的标注 */}
            {selectedAnnotation && (
                <div className="p-3 border-t border-gray-700 bg-gray-800 max-h-60 overflow-y-auto">
                    <h3 className="mb-2 text-sm font-semibold">编辑标注</h3>
                    
                    <div className="mb-2">
                        <label className="flex items-center justify-between mb-1.5 text-[10px] text-gray-400">
                            <span className="flex items-center gap-1">
                                <Tag size={10} /> 缺陷类型
                            </span>
                            <button 
                                onClick={() => setShowAddDefect(!showAddDefect)}
                                className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-lx-gold/20 text-lx-gold rounded hover:bg-lx-gold/30"
                            >
                                <Plus size={10} /> 新增
                            </button>
                        </label>
                        
                        {/* 添加新缺陷类型的表单 */}
                        {showAddDefect && (
                            <div className="mb-2 p-2 bg-gray-900 rounded-lg">
                                <div className="flex gap-1.5 mb-2">
                                    <input 
                                        type="text" 
                                        value={newDefectLabel}
                                        onChange={(e) => setNewDefectLabel(e.target.value)}
                                        placeholder="缺陷名称..."
                                        className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:border-lx-gold focus:outline-none"
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddDefectType()}
                                    />
                                    <button onClick={handleAddDefectType} className="px-2 py-1 bg-lx-gold text-lx-black rounded text-[10px] font-medium">
                                        添加
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {PRESET_COLORS.map((color) => (
                                        <button 
                                            key={color} 
                                            onClick={() => setNewDefectColor(color)}
                                            className={`w-4 h-4 rounded ${newDefectColor === color ? 'ring-2 ring-white' : ''}`}
                                            style={{ backgroundColor: color }} 
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                            {defectTemplates.map((template) => (
                                <div key={template.label} className="relative group">
                                    <button onClick={() => applyTemplate(template)}
                                        className={`px-2 py-0.5 text-[10px] rounded border transition-colors
                                            ${selectedAnnotation.label === template.label 
                                                ? 'text-white' 
                                                : 'bg-gray-900 text-white hover:bg-gray-700'}`}
                                        style={{ 
                                            backgroundColor: selectedAnnotation.label === template.label ? template.color : undefined,
                                            borderColor: template.color 
                                        }}>
                                        {template.label}
                                    </button>
                                    {template.isCustom && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleRemoveDefectType(template.label); }}
                                            className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={8} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div className="mb-2">
                        <input type="text" value={selectedAnnotation.label}
                            onChange={(e) => updateAnnotation(selectedAnnotation.id, { label: e.target.value })}
                            placeholder="自定义类型..." list="labels"
                            className="w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:border-lx-gold focus:outline-none" />
                    </div>
                    
                    <div>
                        <label className="block mb-1.5 text-[10px] text-gray-400">颜色</label>
                        <div className="flex flex-wrap gap-1">
                            {PRESET_COLORS.map((color) => (
                                <button key={color} onClick={() => updateAnnotation(selectedAnnotation.id, { color })}
                                    className={`w-5 h-5 rounded transition-transform hover:scale-110 ${selectedAnnotation.color === color ? 'ring-2 ring-white' : ''}`}
                                    style={{ backgroundColor: color }} />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 编辑选中的掩码 */}
            {selectedMask && !selectedAnnotation && (
                <div className="p-3 border-t border-gray-700 bg-gray-800 max-h-60 overflow-y-auto">
                    <h3 className="mb-2 text-sm font-semibold">编辑掩码</h3>
                    
                    <div className="mb-2">
                        <label className="flex items-center gap-1 mb-1.5 text-[10px] text-gray-400">
                            <Tag size={10} /> 缺陷类型
                        </label>
                        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                            {defectTemplates.map((template) => (
                                <button key={template.label} onClick={() => applyMaskTemplate(template)}
                                    className={`px-2 py-0.5 text-[10px] rounded border transition-colors
                                        ${selectedMask.label === template.label 
                                            ? 'text-white' 
                                            : 'bg-gray-900 text-white hover:bg-gray-700'}`}
                                    style={{ 
                                        backgroundColor: selectedMask.label === template.label ? template.color : undefined,
                                        borderColor: template.color 
                                    }}>
                                    {template.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="flex gap-2 mb-2">
                        <div className="flex-[2]">
                            <label className="block mb-1 text-[10px] text-gray-400">标签</label>
                            <input type="text" value={selectedMask.label}
                                onChange={(e) => updateMask(selectedMask.id, { label: e.target.value })}
                                placeholder="自定义..."
                                className="w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:border-lx-gold focus:outline-none" />
                        </div>
                        <div className="flex-1">
                            <label className="block mb-1 text-[10px] text-gray-400">类别ID</label>
                            <input type="number" min="1" max="255" value={selectedMask.classId}
                                onChange={(e) => updateMask(selectedMask.id, { classId: parseInt(e.target.value) || 1 })}
                                className="w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:border-lx-gold focus:outline-none" />
                        </div>
                    </div>
                    
                    <div>
                        <label className="block mb-1.5 text-[10px] text-gray-400">颜色</label>
                        <div className="flex flex-wrap gap-1">
                            {PRESET_COLORS.map((color) => (
                                <button key={color} onClick={() => updateMask(selectedMask.id, { color })}
                                    className={`w-5 h-5 rounded transition-transform hover:scale-110 ${selectedMask.color === color ? 'ring-2 ring-white' : ''}`}
                                    style={{ backgroundColor: color }} />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PropertiesPanel;

