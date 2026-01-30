import React from 'react';
import { MousePointer2, Square, Hexagon, Paintbrush, Eraser, Pentagon } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { ToolType } from '../../types';

const ToolsPanel: React.FC = () => {
    const { selectedTool, setSelectedTool } = useAppStore();

    const tools: { id: ToolType; icon: React.ReactNode; label: string; shortcut: string }[] = [
        { id: 'select', icon: <MousePointer2 size={20} />, label: '选择', shortcut: '1' },
        { id: 'bbox', icon: <Square size={20} />, label: '边界框', shortcut: '2' },
        { id: 'polygon', icon: <Hexagon size={20} />, label: '多边形', shortcut: '3' },
        { id: 'polygon_mask', icon: <Pentagon size={20} />, label: '多边形分割', shortcut: '4' },
        { id: 'brush', icon: <Paintbrush size={20} />, label: '画笔', shortcut: '5' },
        { id: 'eraser', icon: <Eraser size={20} />, label: '橡皮擦', shortcut: '6' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tools.map((tool) => (
                <div 
                    key={tool.id}
                    className="tooltip"
                    data-tooltip={`${tool.label} (${tool.shortcut})`}
                    style={{ position: 'relative' }}
                >
                    <button
                        onClick={() => setSelectedTool(tool.id)}
                        title={`${tool.label} (${tool.shortcut})`}
                        style={{
                            width: '40px',
                            height: '40px',
                            padding: '10px',
                            borderRadius: '8px',
                            backgroundColor: selectedTool === tool.id ? 'var(--accent-primary)' : 'transparent',
                            color: selectedTool === tool.id ? 'white' : 'var(--text-secondary)',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {tool.icon}
                    </button>
                </div>
            ))}
            
            {/* 分隔线 */}
            <div style={{ 
                height: '1px', 
                backgroundColor: 'var(--border-color)', 
                margin: '10px 5px' 
            }} />
            
            {/* 快捷键提示 */}
            <div style={{ 
                fontSize: '0.65rem', 
                color: 'var(--text-secondary)',
                textAlign: 'center',
                padding: '0 5px'
            }}>
                <div>[ ] 画笔</div>
                <div>Del 删除</div>
            </div>
        </div>
    );
};

export default ToolsPanel;
