import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { ImageFile } from './annotationTypes';

// Helper to load an image to get its dimensions
const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
};

// 生成时间戳文件名
const generateTimestamp = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
};

// 数据集划分
const splitDataset = (images: ImageFile[], ratio: { train: number; val: number; test: number }) => {
    const shuffled = [...images].sort(() => Math.random() - 0.5);
    const trainCount = Math.floor(shuffled.length * ratio.train / 100);
    const valCount = Math.floor(shuffled.length * ratio.val / 100);
    
    return {
        train: shuffled.slice(0, trainCount),
        val: shuffled.slice(trainCount, trainCount + valCount),
        test: shuffled.slice(trainCount + valCount)
    };
};

// Generate a binary/colored mask from annotations
export const generateMask = async (imageFile: ImageFile): Promise<Blob | null> => {
    try {
        const img = await loadImage(imageFile.url);
        if (img.width === 0 || img.height === 0) return null;

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        imageFile.annotations.forEach((ann) => {
            ctx.beginPath();
            ctx.fillStyle = '#FFFFFF';

            if (ann.type === 'bbox') {
                const [x, y, w, h] = ann.points;
                ctx.fillRect(x, y, w, h);
            } else if (ann.type === 'polygon' && ann.points.length >= 2) {
                ctx.moveTo(ann.points[0], ann.points[1]);
                for (let i = 2; i < ann.points.length; i += 2) {
                    ctx.lineTo(ann.points[i], ann.points[i + 1]);
                }
                ctx.closePath();
                ctx.fill();
            }
        });

        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), 'image/png');
        });
    } catch (error) {
        console.error(`Error generating mask for ${imageFile.name}:`, error);
        return null;
    }
};

// Generate semantic segmentation mask
export const generateSegmentationMask = async (imageFile: ImageFile): Promise<Blob | null> => {
    try {
        const img = await loadImage(imageFile.url);
        if (img.width === 0 || img.height === 0) return null;

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (imageFile.segmentationMasks && imageFile.segmentationMasks.length > 0) {
            imageFile.segmentationMasks.forEach((mask) => {
                if (mask.maskData) {
                    ctx.putImageData(mask.maskData, 0, 0);
                }
            });
        }

        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), 'image/png');
        });
    } catch (error) {
        console.error(`Error generating segmentation mask for ${imageFile.name}:`, error);
        return null;
    }
};

// 标准 ZIP 格式导出
export const generateBatchExport = async (images: ImageFile[]) => {
    const zip = new JSZip();
    const annotationsFolder = zip.folder('annotations');
    const masksFolder = zip.folder('masks');
    const segmentationMasksFolder = zip.folder('segmentation_masks');
    const imagesFolder = zip.folder('images');

    if (!annotationsFolder || !masksFolder || !imagesFolder) return;

    const promises = images.map(async (img) => {
        const baseName = img.name.substring(0, img.name.lastIndexOf('.')) || img.name;

        const jsonContent = JSON.stringify({
            imageName: img.name,
            metadata: img.metadata,
            annotations: img.annotations,
            segmentationMasks: img.segmentationMasks.map(mask => ({
                id: mask.id,
                label: mask.label,
                classId: mask.classId,
                color: mask.color
            })),
            timestamp: new Date().toISOString(),
        }, null, 2);
        annotationsFolder.file(`${baseName}.json`, jsonContent);

        try {
            const maskBlob = await generateMask(img);
            if (maskBlob) masksFolder.file(`${baseName}_mask.png`, maskBlob);
        } catch (error) {}

        if (segmentationMasksFolder && img.segmentationMasks && img.segmentationMasks.length > 0) {
            try {
                const segMaskBlob = await generateSegmentationMask(img);
                if (segMaskBlob) segmentationMasksFolder.file(`${baseName}_segmentation_mask.png`, segMaskBlob);
            } catch (error) {}
        }

        if (img.originalFile) imagesFolder.file(img.name, img.originalFile);
    });

    await Promise.all(promises);

    const totalImages = images.length;
    const totalAnnotations = images.reduce((sum, img) => sum + img.annotations.length, 0);
    const totalMasks = images.reduce((sum, img) => sum + (img.segmentationMasks?.length || 0), 0);
    const timestamp = generateTimestamp();
    const filename = `dataset_export_${timestamp}_${totalImages}images_${totalAnnotations}annotations_${totalMasks}masks.zip`;

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, filename);
};

// COCO 格式导出
export const generateCOCOExport = async (images: ImageFile[], splitRatio?: { train: number; val: number; test: number }) => {
    const zip = new JSZip();
    
    const splits = splitRatio ? splitDataset(images, splitRatio) : { train: images, val: [], test: [] };
    
    for (const [splitName, splitImages] of Object.entries(splits)) {
        if (splitImages.length === 0) continue;
        
        const imagesFolder = zip.folder(`${splitName}/images`);
        
        const categoryMap = new Map<string, number>();
        let categoryId = 1;
        
        splitImages.forEach(img => {
            img.annotations.forEach(ann => {
                if (!categoryMap.has(ann.label)) {
                    categoryMap.set(ann.label, categoryId++);
                }
            });
        });

        const cocoData = {
            info: {
                description: '理链AI Data Tool 导出',
                version: '1.0',
                year: new Date().getFullYear(),
                date_created: new Date().toISOString()
            },
            licenses: [],
            images: [] as any[],
            annotations: [] as any[],
            categories: Array.from(categoryMap.entries()).map(([name, id]) => ({
                id, name, supercategory: 'defect'
            }))
        };

        let annotationId = 1;

        for (let i = 0; i < splitImages.length; i++) {
            const img = splitImages[i];
            const loadedImg = await loadImage(img.url);
            
            cocoData.images.push({
                id: i + 1,
                file_name: img.name,
                width: loadedImg.width,
                height: loadedImg.height
            });

            img.annotations.forEach(ann => {
                const catId = categoryMap.get(ann.label) || 1;
                
                if (ann.type === 'bbox') {
                    const [x, y, w, h] = ann.points;
                    cocoData.annotations.push({
                        id: annotationId++,
                        image_id: i + 1,
                        category_id: catId,
                        bbox: [x, y, w, h],
                        area: w * h,
                        iscrowd: 0
                    });
                } else if (ann.type === 'polygon') {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    for (let j = 0; j < ann.points.length; j += 2) {
                        minX = Math.min(minX, ann.points[j]);
                        maxX = Math.max(maxX, ann.points[j]);
                        minY = Math.min(minY, ann.points[j + 1]);
                        maxY = Math.max(maxY, ann.points[j + 1]);
                    }
                    
                    cocoData.annotations.push({
                        id: annotationId++,
                        image_id: i + 1,
                        category_id: catId,
                        segmentation: [ann.points],
                        bbox: [minX, minY, maxX - minX, maxY - minY],
                        area: (maxX - minX) * (maxY - minY),
                        iscrowd: 0
                    });
                }
            });

            if (img.originalFile && imagesFolder) {
                imagesFolder.file(img.name, img.originalFile);
            }
        }

        zip.file(`${splitName}/annotations.json`, JSON.stringify(cocoData, null, 2));
    }

    const timestamp = generateTimestamp();
    const totalImages = images.length;
    const totalAnnotations = images.reduce((sum, img) => sum + img.annotations.length, 0);
    const filename = `coco_export_${timestamp}_${totalImages}images_${totalAnnotations}annotations.zip`;

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, filename);
};

// YOLO 格式导出
export const generateYOLOExport = async (images: ImageFile[], splitRatio?: { train: number; val: number; test: number }) => {
    const zip = new JSZip();
    
    const splits = splitRatio ? splitDataset(images, splitRatio) : { train: images, val: [], test: [] };

    const categoryMap = new Map<string, number>();
    let categoryId = 0;
    
    images.forEach(img => {
        img.annotations.forEach(ann => {
            if (!categoryMap.has(ann.label)) {
                categoryMap.set(ann.label, categoryId++);
            }
        });
    });

    // classes.txt
    const classesContent = Array.from(categoryMap.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([name]) => name)
        .join('\n');
    zip.file('classes.txt', classesContent);

    for (const [splitName, splitImages] of Object.entries(splits)) {
        if (splitImages.length === 0) continue;
        
        const imagesFolder = zip.folder(`${splitName}/images`);
        const labelsFolder = zip.folder(`${splitName}/labels`);

        for (const img of splitImages) {
            const loadedImg = await loadImage(img.url);
            const imgWidth = loadedImg.width;
            const imgHeight = loadedImg.height;
            const baseName = img.name.substring(0, img.name.lastIndexOf('.')) || img.name;

            const lines: string[] = [];
            
            img.annotations.forEach(ann => {
                const classId = categoryMap.get(ann.label) || 0;
                
                if (ann.type === 'bbox') {
                    const [x, y, w, h] = ann.points;
                    const xCenter = (x + w / 2) / imgWidth;
                    const yCenter = (y + h / 2) / imgHeight;
                    lines.push(`${classId} ${xCenter.toFixed(6)} ${yCenter.toFixed(6)} ${(w / imgWidth).toFixed(6)} ${(h / imgHeight).toFixed(6)}`);
                } else if (ann.type === 'polygon') {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    for (let i = 0; i < ann.points.length; i += 2) {
                        minX = Math.min(minX, ann.points[i]);
                        maxX = Math.max(maxX, ann.points[i]);
                        minY = Math.min(minY, ann.points[i + 1]);
                        maxY = Math.max(maxY, ann.points[i + 1]);
                    }
                    const w = maxX - minX;
                    const h = maxY - minY;
                    const xCenter = (minX + w / 2) / imgWidth;
                    const yCenter = (minY + h / 2) / imgHeight;
                    lines.push(`${classId} ${xCenter.toFixed(6)} ${yCenter.toFixed(6)} ${(w / imgWidth).toFixed(6)} ${(h / imgHeight).toFixed(6)}`);
                }
            });

            if (labelsFolder) labelsFolder.file(`${baseName}.txt`, lines.join('\n'));
            if (img.originalFile && imagesFolder) imagesFolder.file(img.name, img.originalFile);
        }
    }

    // data.yaml
    const dataYaml = `# 理链AI Data Tool YOLO 导出
# ${new Date().toISOString()}

train: train/images
val: val/images
test: test/images

nc: ${categoryMap.size}
names: [${Array.from(categoryMap.entries()).sort((a, b) => a[1] - b[1]).map(([name]) => `'${name}'`).join(', ')}]
`;
    zip.file('data.yaml', dataYaml);

    const timestamp = generateTimestamp();
    const totalImages = images.length;
    const totalAnnotations = images.reduce((sum, img) => sum + img.annotations.length, 0);
    const filename = `yolo_export_${timestamp}_${totalImages}images_${totalAnnotations}annotations.zip`;

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, filename);
};

// Pascal VOC 格式导出
export const generateVOCExport = async (images: ImageFile[], splitRatio?: { train: number; val: number; test: number }) => {
    const zip = new JSZip();
    
    const splits = splitRatio ? splitDataset(images, splitRatio) : { train: images, val: [], test: [] };

    for (const [splitName, splitImages] of Object.entries(splits)) {
        if (splitImages.length === 0) continue;
        
        const imagesFolder = zip.folder(`${splitName}/JPEGImages`);
        const annotationsFolder = zip.folder(`${splitName}/Annotations`);
        const imageSetFolder = zip.folder(`${splitName}/ImageSets/Main`);

        const imageNames: string[] = [];

        for (const img of splitImages) {
            const loadedImg = await loadImage(img.url);
            const baseName = img.name.substring(0, img.name.lastIndexOf('.')) || img.name;
            imageNames.push(baseName);

            // XML 标注
            let xml = `<?xml version="1.0" encoding="UTF-8"?>
<annotation>
    <folder>JPEGImages</folder>
    <filename>${img.name}</filename>
    <size>
        <width>${loadedImg.width}</width>
        <height>${loadedImg.height}</height>
        <depth>3</depth>
    </size>
    <segmented>0</segmented>`;

            img.annotations.forEach(ann => {
                if (ann.type === 'bbox') {
                    const [x, y, w, h] = ann.points;
                    xml += `
    <object>
        <name>${ann.label}</name>
        <pose>Unspecified</pose>
        <truncated>0</truncated>
        <difficult>0</difficult>
        <bndbox>
            <xmin>${Math.round(x)}</xmin>
            <ymin>${Math.round(y)}</ymin>
            <xmax>${Math.round(x + w)}</xmax>
            <ymax>${Math.round(y + h)}</ymax>
        </bndbox>
    </object>`;
                } else if (ann.type === 'polygon') {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    for (let i = 0; i < ann.points.length; i += 2) {
                        minX = Math.min(minX, ann.points[i]);
                        maxX = Math.max(maxX, ann.points[i]);
                        minY = Math.min(minY, ann.points[i + 1]);
                        maxY = Math.max(maxY, ann.points[i + 1]);
                    }
                    xml += `
    <object>
        <name>${ann.label}</name>
        <pose>Unspecified</pose>
        <truncated>0</truncated>
        <difficult>0</difficult>
        <bndbox>
            <xmin>${Math.round(minX)}</xmin>
            <ymin>${Math.round(minY)}</ymin>
            <xmax>${Math.round(maxX)}</xmax>
            <ymax>${Math.round(maxY)}</ymax>
        </bndbox>
    </object>`;
                }
            });

            xml += '\n</annotation>';

            if (annotationsFolder) annotationsFolder.file(`${baseName}.xml`, xml);
            if (img.originalFile && imagesFolder) imagesFolder.file(img.name, img.originalFile);
        }

        // ImageSets
        if (imageSetFolder) {
            imageSetFolder.file(`${splitName}.txt`, imageNames.join('\n'));
        }
    }

    const timestamp = generateTimestamp();
    const totalImages = images.length;
    const totalAnnotations = images.reduce((sum, img) => sum + img.annotations.length, 0);
    const filename = `voc_export_${timestamp}_${totalImages}images_${totalAnnotations}annotations.zip`;

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, filename);
};

