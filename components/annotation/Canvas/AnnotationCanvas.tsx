import { useState, useRef, useEffect, forwardRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Line, Circle, Group } from 'react-konva';
import useImage from 'use-image';
import { v4 as uuidv4 } from 'uuid';
import { useAnnotationStore } from '../annotationStore';
import type { KonvaEventObject } from 'konva/lib/Node';
import Konva from 'konva';

const AnnotationCanvas = forwardRef<Konva.Stage>((_, ref) => {
    const {
        getCurrentImage,
        selectedTool,
        addAnnotation,
        selectedAnnotationId,
        setSelectedAnnotationId,
        selectedMaskId,
        setSelectedMaskId,
        currentClassId,
        brushSize,
        addMask,
        updateMaskData,
        hiddenLabels,
        imageAdjustments
    } = useAnnotationStore();

    const currentImageFile = getCurrentImage();
    const [image] = useImage(currentImageFile?.url || '', 'anonymous');
    const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Mask canvas refs
    const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [maskImageUrl, setMaskImageUrl] = useState<string | null>(null);

    // Drawing state
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPoints, setCurrentPoints] = useState<number[]>([]);
    const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);
    const [lastDrawPos, setLastDrawPos] = useState<{ x: number, y: number } | null>(null);

    // Zoom/Pan state
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });

    // Initialize mask canvas when image loads
    useEffect(() => {
        if (image && currentImageFile) {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            maskCanvasRef.current = canvas;
            
            // Load existing masks
            if (currentImageFile.segmentationMasks.length > 0) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    
                    currentImageFile.segmentationMasks.forEach(mask => {
                        ctx.putImageData(mask.maskData, 0, 0);
                    });
                }
            }
            
            updateMaskPreview();
        }
    }, [image, currentImageFile?.id]);

    // Update mask preview when masks change
    useEffect(() => {
        if (maskCanvasRef.current && currentImageFile) {
            const ctx = maskCanvasRef.current.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
                
                currentImageFile.segmentationMasks.forEach(mask => {
                    ctx.putImageData(mask.maskData, 0, 0);
                });
            }
            updateMaskPreview();
        }
    }, [currentImageFile?.segmentationMasks]);

    const updateMaskPreview = () => {
        if (maskCanvasRef.current && currentImageFile) {
            // Create colored preview canvas
            const previewCanvas = document.createElement('canvas');
            previewCanvas.width = maskCanvasRef.current.width;
            previewCanvas.height = maskCanvasRef.current.height;
            const previewCtx = previewCanvas.getContext('2d');
            
            if (previewCtx) {
                const maskData = maskCanvasRef.current.getContext('2d')!.getImageData(
                    0, 0, 
                    maskCanvasRef.current.width, 
                    maskCanvasRef.current.height
                );
                const previewData = previewCtx.createImageData(previewCanvas.width, previewCanvas.height);
                
                // Create classId to color mapping
                const classColorMap: { [key: number]: string } = {};
                currentImageFile.segmentationMasks.forEach(mask => {
                    classColorMap[mask.classId] = mask.color;
                });
                
                // Convert grayscale mask to colored preview
                for (let i = 0; i < maskData.data.length; i += 4) {
                    const classId = maskData.data[i]; // R channel contains classId
                    
                    if (classId > 0 && classColorMap[classId]) {
                        // Convert hex color to RGB
                        const hex = classColorMap[classId].replace('#', '');
                        const r = parseInt(hex.substring(0, 2), 16);
                        const g = parseInt(hex.substring(2, 4), 16);
                        const b = parseInt(hex.substring(4, 6), 16);
                        
                        previewData.data[i] = r;
                        previewData.data[i + 1] = g;
                        previewData.data[i + 2] = b;
                        previewData.data[i + 3] = 150; // Semi-transparent
                    } else {
                        previewData.data[i] = 0;
                        previewData.data[i + 1] = 0;
                        previewData.data[i + 2] = 0;
                        previewData.data[i + 3] = 0; // Transparent
                    }
                }
                
                previewCtx.putImageData(previewData, 0, 0);
                const url = previewCanvas.toDataURL();
                if (maskImageUrl) {
                    URL.revokeObjectURL(maskImageUrl);
                }
                setMaskImageUrl(url);
            }
        }
    };

    useEffect(() => {
        if (containerRef.current) {
            setStageSize({
                width: containerRef.current.offsetWidth,
                height: containerRef.current.offsetHeight
            });
        }

        const handleResize = () => {
            if (containerRef.current) {
                setStageSize({
                    width: containerRef.current.offsetWidth,
                    height: containerRef.current.offsetHeight
                });
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Reset view when image loads
    useEffect(() => {
        if (image && stageSize.width > 0) {
            const scaleX = stageSize.width / image.width;
            const scaleY = stageSize.height / image.height;
            const newScale = Math.min(scaleX, scaleY, 1) * 0.9;
            setScale(newScale);
            setPosition({
                x: (stageSize.width - image.width * newScale) / 2,
                y: (stageSize.height - image.height * newScale) / 2
            });
        }
    }, [image, stageSize]);

    const getRelativePointerPosition = (node: any) => {
        const transform = node.getAbsoluteTransform().copy();
        transform.invert();
        const pos = node.getStage().getPointerPosition();
        return transform.point(pos);
    };

    // Fill polygon on mask canvas
    const fillPolygonOnMask = (points: number[]) => {
        if (!maskCanvasRef.current || !image || points.length < 6) return;
        
        const canvas = maskCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Get current image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Find bounding box of polygon
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < points.length; i += 2) {
            minX = Math.min(minX, points[i]);
            maxX = Math.max(maxX, points[i]);
            minY = Math.min(minY, points[i + 1]);
            maxY = Math.max(maxY, points[i + 1]);
        }

        // Clamp to canvas bounds
        minX = Math.max(0, Math.floor(minX));
        minY = Math.max(0, Math.floor(minY));
        maxX = Math.min(canvas.width - 1, Math.ceil(maxX));
        maxY = Math.min(canvas.height - 1, Math.ceil(maxY));

        // Point in polygon test using ray casting
        const isPointInPolygon = (px: number, py: number): boolean => {
            let inside = false;
            for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
                const xi = points[i], yi = points[i + 1];
                const xj = points[j], yj = points[j + 1];
                
                if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
                    inside = !inside;
                }
            }
            return inside;
        };

        // Fill pixels inside polygon
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (isPointInPolygon(x, y)) {
                    const idx = (y * canvas.width + x) * 4;
                    data[idx] = currentClassId;     // R = classId
                    data[idx + 1] = currentClassId; // G = classId
                    data[idx + 2] = currentClassId; // B = classId
                    data[idx + 3] = 255;            // A
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
        updateMaskPreview();
    };

    const drawOnMask = (x: number, y: number, isEraser: boolean = false) => {
        if (!maskCanvasRef.current || !image) return;
        
        const canvas = maskCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clamp coordinates to image bounds
        const px = Math.max(0, Math.min(Math.floor(x), image.width - 1));
        const py = Math.max(0, Math.min(Math.floor(y), image.height - 1));

        const radius = Math.floor(brushSize / 2);
        
        // Get image data for pixel manipulation
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Draw circle by setting pixel values
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= radius) {
                    const px2 = px + dx;
                    const py2 = py + dy;
                    
                    if (px2 >= 0 && px2 < canvas.width && py2 >= 0 && py2 < canvas.height) {
                        const idx = (py2 * canvas.width + px2) * 4;
                        
                        if (isEraser) {
                            // Erase: set to black (class 0)
                            data[idx] = 0;     // R
                            data[idx + 1] = 0; // G
                            data[idx + 2] = 0; // B
                            data[idx + 3] = 255; // A
                        } else {
                            // Draw: set pixel value to classId (store in R channel, use grayscale)
                            const classValue = currentClassId;
                            data[idx] = classValue;     // R = classId
                            data[idx + 1] = classValue; // G = classId
                            data[idx + 2] = classValue; // B = classId
                            data[idx + 3] = 255;        // A
                        }
                    }
                }
            }
        }
        
        // Draw line from last position for smooth drawing
        if (lastDrawPos && !isEraser) {
            const steps = Math.max(Math.abs(px - lastDrawPos.x), Math.abs(py - lastDrawPos.y));
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const cx = Math.floor(lastDrawPos.x + (px - lastDrawPos.x) * t);
                const cy = Math.floor(lastDrawPos.y + (py - lastDrawPos.y) * t);
                
                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist <= radius) {
                            const px2 = cx + dx;
                            const py2 = cy + dy;
                            
                            if (px2 >= 0 && px2 < canvas.width && py2 >= 0 && py2 < canvas.height) {
                                const idx = (py2 * canvas.width + px2) * 4;
                                const classValue = currentClassId;
                                data[idx] = classValue;
                                data[idx + 1] = classValue;
                                data[idx + 2] = classValue;
                                data[idx + 3] = 255;
                            }
                        }
                    }
                }
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        setLastDrawPos({ x: px, y: py });
        updateMaskPreview();
    };

    const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
        if (selectedTool === 'select') {
            const clickedOnEmpty = e.target === e.target.getStage();
            if (clickedOnEmpty) {
                setSelectedAnnotationId(null);
                setSelectedMaskId(null);
            }
            return;
        }

        const stage = e.target.getStage();
        const pos = getRelativePointerPosition(stage?.getLayers()[0]);

        if (selectedTool === 'bbox') {
            setIsDrawing(true);
            setCurrentPoints([pos.x, pos.y, 0, 0]);
        } else if (selectedTool === 'polygon' || selectedTool === 'polygon_mask') {
            if (!isDrawing) {
                // For polygon_mask, ensure we have a mask ready
                if (selectedTool === 'polygon_mask' && image && currentImageFile) {
                    let currentMask = currentImageFile.segmentationMasks.find(m => m.id === selectedMaskId);
                    if (!currentMask) {
                        // Create new mask
                        const canvas = document.createElement('canvas');
                        canvas.width = image.width;
                        canvas.height = image.height;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.fillStyle = '#000000';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                        }
                        
                        const newMask = {
                            id: uuidv4(),
                            label: `Class ${currentClassId}`,
                            color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
                            classId: currentClassId,
                            maskData: ctx!.getImageData(0, 0, canvas.width, canvas.height)
                        };
                        
                        addMask(newMask);
                        setSelectedMaskId(newMask.id);
                        
                        // Update mask canvas
                        if (maskCanvasRef.current) {
                            const maskCtx = maskCanvasRef.current.getContext('2d');
                            if (maskCtx) {
                                maskCtx.putImageData(newMask.maskData, 0, 0);
                            }
                        }
                    }
                }
                setIsDrawing(true);
                setCurrentPoints([pos.x, pos.y]);
            } else {
                setCurrentPoints([...currentPoints, pos.x, pos.y]);
            }
        } else if (selectedTool === 'brush' || selectedTool === 'eraser') {
            if (!image || !currentImageFile) return;
            
            setIsDrawing(true);
            setLastDrawPos(null);
            
            // Create or get current mask
            let currentMask = currentImageFile.segmentationMasks.find(m => m.id === selectedMaskId);
            if (!currentMask && selectedTool === 'brush') {
                // Create new mask
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                
                const newMask = {
                    id: uuidv4(),
                    label: `Class ${currentClassId}`,
                    color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
                    classId: currentClassId,
                    maskData: ctx!.getImageData(0, 0, canvas.width, canvas.height)
                };
                
                addMask(newMask);
                setSelectedMaskId(newMask.id);
                currentMask = newMask;
                
                // Update mask canvas
                if (maskCanvasRef.current) {
                    const maskCtx = maskCanvasRef.current.getContext('2d');
                    if (maskCtx) {
                        maskCtx.putImageData(newMask.maskData, 0, 0);
                    }
                }
            }
            
            drawOnMask(pos.x, pos.y, selectedTool === 'eraser');
        }
    };

    const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
        const stage = e.target.getStage();
        const pos = getRelativePointerPosition(stage?.getLayers()[0]);
        setMousePos(pos);

        if (!isDrawing) return;

        if (selectedTool === 'bbox') {
            const startX = currentPoints[0];
            const startY = currentPoints[1];
            const width = pos.x - startX;
            const height = pos.y - startY;
            setCurrentPoints([startX, startY, width, height]);
        } else if (selectedTool === 'brush' || selectedTool === 'eraser') {
            drawOnMask(pos.x, pos.y, selectedTool === 'eraser');
        }
    };

    const handleMouseUp = () => {
        if (selectedTool === 'bbox' && isDrawing) {
            setIsDrawing(false);
            let [x, y, w, h] = currentPoints;
            if (w < 0) { x += w; w = Math.abs(w); }
            if (h < 0) { y += h; h = Math.abs(h); }

            if (w > 5 && h > 5) {
                addAnnotation({
                    id: uuidv4(),
                    type: 'bbox',
                    points: [x, y, w, h],
                    label: 'Defect',
                    color: '#' + Math.floor(Math.random() * 16777215).toString(16)
                });
            }
            setCurrentPoints([]);
        } else if ((selectedTool === 'brush' || selectedTool === 'eraser') && isDrawing) {
            setIsDrawing(false);
            setLastDrawPos(null);
            
            // Save mask data
            if (maskCanvasRef.current && selectedMaskId) {
                const maskData = maskCanvasRef.current.getContext('2d')!.getImageData(
                    0, 0, 
                    maskCanvasRef.current.width, 
                    maskCanvasRef.current.height
                );
                updateMaskData(selectedMaskId, maskData);
            }
        }
    };

    const handlePolygonClick = (e: KonvaEventObject<MouseEvent>) => {
        if ((selectedTool === 'polygon' || selectedTool === 'polygon_mask') && isDrawing) {
            const stage = e.target.getStage();
            const pos = getRelativePointerPosition(stage?.getLayers()[0]);

            if (currentPoints.length >= 6) {
                const startX = currentPoints[0];
                const startY = currentPoints[1];
                const dist = Math.sqrt(Math.pow(pos.x - startX, 2) + Math.pow(pos.y - startY, 2));
                if (dist < 10) {
                    if (selectedTool === 'polygon') {
                        finishPolygon();
                    } else {
                        finishPolygonMask();
                    }
                }
            }
        }
    };

    const finishPolygon = () => {
        if (currentPoints.length >= 6) {
            addAnnotation({
                id: uuidv4(),
                type: 'polygon',
                points: currentPoints,
                label: 'Defect',
                color: '#' + Math.floor(Math.random() * 16777215).toString(16)
            });
        }
        setIsDrawing(false);
        setCurrentPoints([]);
    };

    const finishPolygonMask = () => {
        if (currentPoints.length >= 6 && maskCanvasRef.current && selectedMaskId) {
            // Fill polygon on mask
            fillPolygonOnMask(currentPoints);
            
            // Save mask data
            const maskData = maskCanvasRef.current.getContext('2d')!.getImageData(
                0, 0, 
                maskCanvasRef.current.width, 
                maskCanvasRef.current.height
            );
            updateMaskData(selectedMaskId, maskData);
        }
        setIsDrawing(false);
        setCurrentPoints([]);
    };

    const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const scaleBy = 1.1;
        const stage = e.target.getStage();
        const oldScale = stage?.scaleX() || 1;
        const pointer = stage?.getPointerPosition();

        if (!pointer) return;

        const mousePointTo = {
            x: (pointer.x - stage!.x()) / oldScale,
            y: (pointer.y - stage!.y()) / oldScale,
        };

        const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

        setPosition({
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        });
        setScale(newScale);
    };

    // Load mask image for preview
    const [maskPreviewImage] = useImage(maskImageUrl || '', 'anonymous');

    return (
        <div ref={containerRef} className="w-full h-full bg-gray-900">
            {!currentImageFile && (
                <div className="flex h-full justify-center items-center text-gray-500">
                    请加载图片开始标注
                </div>
            )}

            {currentImageFile && (
                <Stage
                    ref={ref}
                    width={stageSize.width}
                    height={stageSize.height}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onClick={handlePolygonClick}
                    onWheel={handleWheel}
                    scaleX={scale}
                    scaleY={scale}
                    x={position.x}
                    y={position.y}
                    draggable={selectedTool === 'select'}
                >
                    <Layer>
                        {image && (
                            <KonvaImage 
                                image={image}
                                rotation={currentImageFile.rotation || 0}
                                offsetX={currentImageFile.rotation === 90 || currentImageFile.rotation === 270 ? 0 : 0}
                                offsetY={currentImageFile.rotation === 90 || currentImageFile.rotation === 270 ? 0 : 0}
                                filters={imageAdjustments.brightness !== 100 || imageAdjustments.contrast !== 100 ? [Konva.Filters.Brighten, Konva.Filters.Contrast] : undefined}
                                brightness={(imageAdjustments.brightness - 100) / 100}
                                contrast={(imageAdjustments.contrast - 100) / 100 * 100}
                            />
                        )}

                        {/* Mask Preview */}
                        {maskPreviewImage && (selectedTool === 'brush' || selectedTool === 'eraser' || currentImageFile.segmentationMasks.length > 0) && (
                            <KonvaImage 
                                image={maskPreviewImage} 
                                opacity={0.6}
                            />
                        )}

                        {/* Existing Annotations */}
                        {currentImageFile.annotations
                            .filter(ann => !hiddenLabels.includes(ann.label))
                            .map((ann) => (
                            <Group
                                key={ann.id}
                                onClick={(e) => {
                                    e.cancelBubble = true;
                                    setSelectedAnnotationId(ann.id);
                                }}
                            >
                                {ann.type === 'bbox' && (
                                    <Rect
                                        x={ann.points[0]}
                                        y={ann.points[1]}
                                        width={ann.points[2]}
                                        height={ann.points[3]}
                                        stroke={ann.color}
                                        strokeWidth={2 / scale}
                                        fill={selectedAnnotationId === ann.id ? ann.color + '33' : 'transparent'}
                                    />
                                )}
                                {ann.type === 'polygon' && (
                                    <Line
                                        points={ann.points}
                                        closed
                                        stroke={ann.color}
                                        strokeWidth={2 / scale}
                                        fill={selectedAnnotationId === ann.id ? ann.color + '33' : 'transparent'}
                                    />
                                )}
                            </Group>
                        ))}

                        {/* Drawing Preview */}
                        {isDrawing && selectedTool === 'bbox' && (
                            <Rect
                                x={currentPoints[0]}
                                y={currentPoints[1]}
                                width={currentPoints[2]}
                                height={currentPoints[3]}
                                stroke="#cfa972"
                                strokeWidth={2 / scale}
                            />
                        )}

                        {isDrawing && (selectedTool === 'polygon' || selectedTool === 'polygon_mask') && (
                            <>
                                <Line
                                    points={mousePos ? [...currentPoints, mousePos.x, mousePos.y] : currentPoints}
                                    stroke={selectedTool === 'polygon_mask' ? '#00ff00' : '#cfa972'}
                                    strokeWidth={2 / scale}
                                    closed={selectedTool === 'polygon_mask'}
                                    fill={selectedTool === 'polygon_mask' ? 'rgba(0, 255, 0, 0.2)' : 'transparent'}
                                />
                                {currentPoints.map((_, i) => {
                                    if (i % 2 !== 0) return null;
                                    return (
                                        <Circle
                                            key={i}
                                            x={currentPoints[i]}
                                            y={currentPoints[i + 1]}
                                            radius={4 / scale}
                                            fill={selectedTool === 'polygon_mask' ? '#00ff00' : '#cfa972'}
                                        />
                                    );
                                })}
                                {currentPoints.length >= 2 && (
                                    <Circle
                                        x={currentPoints[0]}
                                        y={currentPoints[1]}
                                        radius={6 / scale}
                                        stroke="yellow"
                                        strokeWidth={2 / scale}
                                    />
                                )}
                            </>
                        )}

                        {/* Brush cursor preview */}
                        {(selectedTool === 'brush' || selectedTool === 'eraser') && mousePos && (
                            <Circle
                                x={mousePos.x}
                                y={mousePos.y}
                                radius={brushSize / 2 / scale}
                                stroke={selectedTool === 'brush' ? '#00ff00' : '#ff0000'}
                                strokeWidth={2 / scale}
                                fill="transparent"
                                dash={[5, 5]}
                            />
                        )}
                    </Layer>
                </Stage>
            )}

            {isDrawing && (selectedTool === 'polygon' || selectedTool === 'polygon_mask') && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-lx-black/90 px-4 py-2 rounded-lg shadow-lg flex gap-3 items-center border border-gray-700">
                    <span className="text-sm text-white">
                        {selectedTool === 'polygon_mask' 
                            ? `类别 ${currentClassId} - 点击添加顶点，点击起点完成填充`
                            : '点击添加顶点，点击起点闭合多边形'}
                    </span>
                    <button
                        onClick={selectedTool === 'polygon_mask' ? finishPolygonMask : finishPolygon}
                        className="text-lx-gold font-semibold hover:text-white transition-colors"
                    >
                        完成
                    </button>
                    <button
                        onClick={() => { setIsDrawing(false); setCurrentPoints([]); }}
                        className="text-red-500 font-semibold hover:text-red-400 transition-colors"
                    >
                        取消
                    </button>
                </div>
            )}

            {/* 坐标显示 */}
            {currentImageFile && mousePos && (
                <div className="absolute bottom-3 left-3 bg-black/70 px-3 py-1.5 rounded text-xs font-mono text-white">
                    X: {Math.round(mousePos.x)} Y: {Math.round(mousePos.y)}
                    {image && <span className="ml-2 opacity-70">| {image.width} × {image.height}</span>}
                </div>
            )}

            {/* 缩放控制 */}
            {currentImageFile && (
                <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/70 px-3 py-1.5 rounded">
                    <button
                        onClick={() => {
                            const newScale = Math.max(0.1, scale / 1.2);
                            setScale(newScale);
                        }}
                        className="px-2 py-1 text-white text-lg hover:bg-gray-700 rounded transition-colors"
                    >
                        −
                    </button>
                    <input
                        type="range"
                        min="10"
                        max="500"
                        value={scale * 100}
                        onChange={(e) => setScale(parseInt(e.target.value) / 100)}
                        className="w-24 accent-lx-gold"
                    />
                    <button
                        onClick={() => {
                            const newScale = Math.min(5, scale * 1.2);
                            setScale(newScale);
                        }}
                        className="px-2 py-1 text-white text-lg hover:bg-gray-700 rounded transition-colors"
                    >
                        +
                    </button>
                    <span className="text-xs text-white min-w-[45px] text-right">
                        {Math.round(scale * 100)}%
                    </span>
                    <button
                        onClick={() => {
                            if (image && stageSize.width > 0) {
                                const scaleX = stageSize.width / image.width;
                                const scaleY = stageSize.height / image.height;
                                const newScale = Math.min(scaleX, scaleY, 1) * 0.9;
                                setScale(newScale);
                                setPosition({
                                    x: (stageSize.width - image.width * newScale) / 2,
                                    y: (stageSize.height - image.height * newScale) / 2
                                });
                            }
                        }}
                        className="px-2 py-1 bg-gray-700 text-white text-[10px] rounded hover:bg-gray-600 transition-colors"
                    >
                        适应
                    </button>
                </div>
            )}
        </div>
    );
});

export default AnnotationCanvas;

