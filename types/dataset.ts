// 零件大类
export enum PartCategory {
  DOOR = 'door',           // 车门
  BUMPER = 'bumper',       // 保险杠
  FENDER = 'fender',       // 翼子板
  HOOD = 'hood',           // 发动机盖
  TRUNK = 'trunk',         // 后备箱盖
  ROOF = 'roof',           // 车顶
  WHEEL = 'wheel',         // 轮毂
  MIRROR = 'mirror',       // 后视镜
  CONSOLE = 'console',     // 中控台
  DASHBOARD = 'dashboard', // 仪表板
  OTHER = 'other'          // 其他
}

export const PART_CATEGORY_LABELS: Record<PartCategory, string> = {
  [PartCategory.DOOR]: '车门',
  [PartCategory.BUMPER]: '保险杠',
  [PartCategory.FENDER]: '翼子板',
  [PartCategory.HOOD]: '发动机盖',
  [PartCategory.TRUNK]: '后备箱盖',
  [PartCategory.ROOF]: '车顶',
  [PartCategory.WHEEL]: '轮毂',
  [PartCategory.MIRROR]: '后视镜',
  [PartCategory.CONSOLE]: '中控台',
  [PartCategory.DASHBOARD]: '仪表板',
  [PartCategory.OTHER]: '其他'
};

// 缺陷类型
export enum DefectType {
  SCRATCH = 'scratch',       // 划痕
  DENT = 'dent',             // 凹坑
  ORANGE_PEEL = 'orange_peel', // 橘皮
  SHRINKAGE = 'shrinkage',   // 缩孔
  PARTICLE = 'particle',     // 颗粒
  COLOR_DIFF = 'color_diff', // 色差
  SAGGING = 'sagging',       // 流挂
  BUBBLE = 'bubble',         // 气泡
  CRACK = 'crack',           // 裂纹
  RUST = 'rust',             // 锈蚀
  MIXED = 'mixed'            // 多缺陷混合
}

export const DEFECT_TYPE_LABELS: Record<DefectType, string> = {
  [DefectType.SCRATCH]: '划痕',
  [DefectType.DENT]: '凹坑',
  [DefectType.ORANGE_PEEL]: '橘皮',
  [DefectType.SHRINKAGE]: '缩孔',
  [DefectType.PARTICLE]: '颗粒',
  [DefectType.COLOR_DIFF]: '色差',
  [DefectType.SAGGING]: '流挂',
  [DefectType.BUBBLE]: '气泡',
  [DefectType.CRACK]: '裂纹',
  [DefectType.RUST]: '锈蚀',
  [DefectType.MIXED]: '多缺陷混合'
};

// 缺陷类型颜色（用于可视化）
export const DEFECT_TYPE_COLORS: Record<DefectType, string> = {
  [DefectType.SCRATCH]: '#ef4444',
  [DefectType.DENT]: '#f97316',
  [DefectType.ORANGE_PEEL]: '#eab308',
  [DefectType.SHRINKAGE]: '#22c55e',
  [DefectType.PARTICLE]: '#14b8a6',
  [DefectType.COLOR_DIFF]: '#3b82f6',
  [DefectType.SAGGING]: '#8b5cf6',
  [DefectType.BUBBLE]: '#ec4899',
  [DefectType.CRACK]: '#6366f1',
  [DefectType.RUST]: '#78716c',
  [DefectType.MIXED]: '#64748b'
};

// 标注状态
export enum AnnotationStatus {
  NOT_STARTED = 'not_started',   // 未开始
  IN_PROGRESS = 'in_progress',   // 标注中
  COMPLETED = 'completed'        // 已完成
}

// 标注数据（简化版，用于持久化存储）
export interface StoredAnnotation {
  id: string;
  type: 'bbox' | 'polygon';
  points: number[];
  label: string;
  color: string;
  locked?: boolean;
  visible?: boolean;
}

// 分割掩码数据（简化版，用于持久化存储）
export interface StoredMask {
  id: string;
  label: string;
  color: string;
  classId: number;
  // maskData 不直接存储，而是存储为 base64 或通过文件引用
  maskDataUrl?: string;
  locked?: boolean;
  visible?: boolean;
}

// 数据集图片
export interface DatasetImage {
  id: string;
  filename: string;
  url: string;              // 图片URL或base64
  width: number;
  height: number;
  isAnnotated: boolean;     // 是否已标注
  annotationCount: number;  // 标注数量
  defectTypes: DefectType[]; // 该图片包含的缺陷类型
  annotations: StoredAnnotation[];  // 标注数据
  masks: StoredMask[];      // 分割掩码数据
  createdAt: string;
  updatedAt: string;
}

// 数据集统计
export interface DatasetStats {
  totalImages: number;
  annotatedImages: number;
  unannotatedImages: number;
  completionRate: number;        // 完成率 0-100
  totalAnnotations: number;      // 总标注数
  defectDistribution: Record<DefectType, number>; // 各缺陷类型的样本数
}

// 数据集实体
export interface Dataset {
  id: string;
  name: string;
  description: string;
  partCategory: PartCategory;    // 零件大类
  partCode?: string;             // 零件编码（选填）
  defectTypes: DefectType[];     // 包含的缺陷类型
  images: DatasetImage[];        // 图片列表
  stats: DatasetStats;           // 统计信息
  createdAt: string;
  updatedAt: string;
}

// 数据集筛选条件
export interface DatasetFilter {
  partCategory?: PartCategory;
  defectTypes?: DefectType[];
  annotationStatus?: AnnotationStatus;
  searchText?: string;
}

// 数据集视图模式（用于标注工具）
export enum DatasetViewMode {
  ALL = 'all',
  ANNOTATED = 'annotated',
  UNANNOTATED = 'unannotated'
}

// 导出格式
export enum ExportFormat {
  COCO = 'coco',
  YOLO = 'yolo'
}

// 导出配置
export interface ExportConfig {
  format: ExportFormat;
  includeImages: boolean;
  onlyAnnotated: boolean;
  defectTypes?: DefectType[];  // 只导出特定缺陷类型
}

// ============== 音频相关类型定义 ==============

// 项目类型
export enum ProjectType {
  VISUAL_DEFECT = 'visual-defect',    // 外观缺陷检测
  AUDIO_ANOMALY = 'audio-anomaly'     // 听觉异响检测
}

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  [ProjectType.VISUAL_DEFECT]: '外观缺陷检测',
  [ProjectType.AUDIO_ANOMALY]: '听觉异响检测'
};

// 数据集类型
export enum DatasetType {
  IMAGE = 'image',
  AUDIO = 'audio'
}

// 音频异常类型
export enum AudioAnomalyType {
  NORMAL = 'normal',
  FAN_BEARING = 'fan_bearing',           // 风扇轴承异响
  RAIL_FRICTION = 'rail_friction',       // 滑轨摩擦异响
  LUMBAR_VIBRATION = 'lumbar_vibration', // 腰托振动异响
  MOTOR_NOISE = 'motor_noise',           // 电机噪声
  GEAR_MESH = 'gear_mesh',               // 齿轮啮合异响
  OTHER = 'other'                        // 其他异响
}

export const AUDIO_ANOMALY_LABELS: Record<AudioAnomalyType, string> = {
  [AudioAnomalyType.NORMAL]: '正常',
  [AudioAnomalyType.FAN_BEARING]: '风扇轴承异响',
  [AudioAnomalyType.RAIL_FRICTION]: '滑轨摩擦异响',
  [AudioAnomalyType.LUMBAR_VIBRATION]: '腰托振动异响',
  [AudioAnomalyType.MOTOR_NOISE]: '电机噪声',
  [AudioAnomalyType.GEAR_MESH]: '齿轮啮合异响',
  [AudioAnomalyType.OTHER]: '其他异响'
};

export const AUDIO_ANOMALY_COLORS: Record<AudioAnomalyType, string> = {
  [AudioAnomalyType.NORMAL]: '#22c55e',
  [AudioAnomalyType.FAN_BEARING]: '#ef4444',
  [AudioAnomalyType.RAIL_FRICTION]: '#f97316',
  [AudioAnomalyType.LUMBAR_VIBRATION]: '#eab308',
  [AudioAnomalyType.MOTOR_NOISE]: '#3b82f6',
  [AudioAnomalyType.GEAR_MESH]: '#8b5cf6',
  [AudioAnomalyType.OTHER]: '#64748b'
};

// 音频异常严重程度
export enum AudioSeverity {
  NORMAL = 'normal',           // 正常
  SUSPICIOUS = 'suspicious',   // 可疑
  MEDIUM = 'medium',           // 中度异常
  SEVERE = 'severe'            // 严重异常
}

export const AUDIO_SEVERITY_LABELS: Record<AudioSeverity, string> = {
  [AudioSeverity.NORMAL]: '正常',
  [AudioSeverity.SUSPICIOUS]: '可疑',
  [AudioSeverity.MEDIUM]: '中度异常',
  [AudioSeverity.SEVERE]: '严重异常'
};

// 时间区间标注（用于音频精细化标注）
export interface TimeSegmentAnnotation {
  id: string;
  startTime: number;              // 开始时间（秒）
  endTime: number;                // 结束时间（秒）
  anomalyType: AudioAnomalyType;  // 异常类型
  severity: AudioSeverity;        // 严重程度
  notes?: string;                 // 该区间的备注
}

// 音频文件
export interface AudioFile {
  id: string;
  filename: string;
  url: string;                    // 音频URL
  duration: number;               // 时长（秒）
  sampleRate: number;             // 采样率
  isAnnotated: boolean;           // 是否已标注
  anomalyType: AudioAnomalyType;  // 整体异常类型（向后兼容）
  severity: AudioSeverity;        // 整体严重程度（向后兼容）
  notes?: string;                 // 备注
  segments?: TimeSegmentAnnotation[]; // 时间区间标注（精细化标注）
  createdAt: string;
  updatedAt: string;
}

// 音频标注
export interface AudioAnnotation {
  id: string;
  audioId: string;
  isAbnormal: boolean;
  anomalyType: AudioAnomalyType;
  severity: AudioSeverity;
  notes?: string;
  annotatedBy: string;
  annotatedAt: string;
}

// 音频数据集统计
export interface AudioDatasetStats {
  totalAudios: number;
  annotatedAudios: number;
  unannotatedAudios: number;
  totalDuration: number;           // 总时长（秒）
  averageDuration: number;         // 平均时长
  completionRate: number;          // 完成率 0-100
  abnormalRatio: number;           // 异常比例 0-100
  anomalyDistribution: Record<AudioAnomalyType, number>; // 各异常类型的样本数
}

// 音频数据集
export interface AudioDataset {
  id: string;
  name: string;
  description: string;
  projectType: ProjectType.AUDIO_ANOMALY;
  datasetType: DatasetType.AUDIO;
  audioFiles: AudioFile[];
  stats: AudioDatasetStats;
  createdAt: string;
  updatedAt: string;
}

// 统一数据集接口（兼容图像和音频）
export interface UnifiedDataset {
  id: string;
  name: string;
  description: string;
  projectType: ProjectType;
  datasetType: DatasetType;
  stats: DatasetStats | AudioDatasetStats;
  createdAt: string;
  updatedAt: string;
  // 图像专用字段
  partCategory?: PartCategory;
  partCode?: string;
  defectTypes?: DefectType[];
  images?: DatasetImage[];
  // 音频专用字段
  audioFiles?: AudioFile[];
}

// 音频训练配置
export interface AudioTrainingConfig {
  datasetId: string;
  modelType: 'ensemble_anomaly';
  contamination: number;           // 污染率 0-1
  featureSelection: 'hybrid' | 'discrimination' | 'variance' | 'correlation';
  topFeatures: number;             // 选择的特征数量
  useEnhancedFeatures: boolean;    // 是否使用增强特征
}

