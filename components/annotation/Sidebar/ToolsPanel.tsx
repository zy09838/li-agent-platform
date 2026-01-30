import React from 'react';
import { MousePointer2, Square, Hexagon, Paintbrush, Eraser, Pentagon } from 'lucide-react';
import { useAnnotationStore } from '../annotationStore';
import type { ToolType } from '../annotationTypes';

const ToolsPanel: React.FC = () => {
    const { selectedTool, setSelectedTool } = useAnnotationStore();

    const tools: { id: ToolType; icon: React.ReactNode; label: string; shortcut: string }[] = [
        { id: 'select', icon: <MousePointer2 size={20} />, label: '选择', shortcut: '1' },
        { id: 'bbox', icon: <Square size={20} />, label: '边界框', shortcut: '2' },
        { id: 'polygon', icon: <Hexagon size={20} />, label: '多边形', shortcut: '3' },
        { id: 'polygon_mask', icon: <Pentagon size={20} />, label: '多边形分割', shortcut: '4' },
        { id: 'brush', icon: <Paintbrush size={20} />, label: '画笔', shortcut: '5' },
        { id: 'eraser', icon: <Eraser size={20} />, label: '橡皮擦', shortcut: '6' },
    ];

    return (
        <div className="flex flex-col gap-2">
            {tools.map((tool) => (
                <div 
                    key={tool.id}
                    className="relative group"
                >
                    <button
                        onClick={() => setSelectedTool(tool.id)}
                        title={`${tool.label} (${tool.shortcut})`}
                        className={`
                            w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200
                            ${selectedTool === tool.id 
                                ? 'bg-lx-gold text-lx-black' 
                                : 'bg-transparent text-gray-400 hover:bg-gray-700 hover:text-white'}
                        `}
                    >
                        {tool.icon}
                    </button>
                    
                    {/* Tooltip */}
                    <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-lx-black text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 border border-gray-700">
                        {tool.label} ({tool.shortcut})
                    </div>
                </div>
            ))}
            
            {/* 分隔线 */}
            <div className="h-px bg-gray-700 my-2" />
            
            {/* 快捷键提示 */}
            <div className="text-[10px] text-gray-500 text-center px-1 space-y-1">
                <div>[ ] 画笔</div>
                <div>Del 删除</div>
            </div>
        </div>
    );
};

export default ToolsPanel;

