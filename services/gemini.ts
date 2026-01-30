// YOLO API 服务地址
const YOLO_API_URL = import.meta.env.VITE_YOLO_API_URL || 'http://localhost:5000';

// 零件类型
export type PartType = 'paint' | 'electric_drive' | 'glass';

// --- Vision Agent Service (YOLO 本地模型) ---
export const analyzeImage = async (
  base64Image: string, 
  partType: PartType = 'paint',
  confidenceThreshold: number = 0.25
) => {
  const response = await fetch(`${YOLO_API_URL}/predict`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: base64Image,
      confidence_threshold: confidenceThreshold,
      part_type: partType
    })
  });

  if (!response.ok) {
    throw new Error(`YOLO API error: ${response.status}`);
  }

  const result = await response.json();
  return {
    status: result.status,
    issue: result.issue,
    confidence: result.confidence,
    detections: result.detections
  };
};

// --- Quality Agent Service (Mock) ---
export const createQualityChat = () => {
  // 简化版：返回模拟聊天对象
  return {
    sendMessage: async (message: string) => {
      return { text: `Quality analysis for: ${message}` };
    }
  };
};

// --- Risk Agent Service (Mock) ---
export const scanGlobalRisks = async () => {
  return [
    {
      level: "Medium",
      title: "供应链预警",
      description: "芯片供应紧张，建议提前备货",
      time: new Date().toLocaleTimeString()
    }
  ];
};

// --- Plan Agent Service (Mock) ---
export const optimizeSchedule = async (_currentData: any) => {
  return "优化完成。当前周计划无明显瓶颈。";
};
