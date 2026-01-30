export enum ViewType {
  HOME = 'home',
  VISION = 'vision',
  AUDIO = 'audio',
  PLAN = 'plan',
  RISK = 'risk',
  QUALITY = 'quality',
  DATA_ANNOTATION = 'data_annotation',
  DATASET_HOME = 'dataset_home',
  DATASET_DETAIL = 'dataset_detail',
  MODEL_TRAINING = 'model_training'
}

export enum AppMode {
  AGENT = 'agent',
  DATASET = 'dataset',
  TRAINING = 'training'
}

export interface KpiData {
  label: string;
  value: string;
  unit: string;
  trend: string;
  trendType: 'up' | 'down' | 'neutral';
  trendColor: 'success' | 'warning' | 'neutral';
  borderColor: string;
}

export interface AgentCardProps {
  id: ViewType;
  title: string;
  description: string;
  status: 'normal' | 'warning' | 'analyzing';
  statusText: string;
  imageUrl: string;
  onClick: (view: ViewType) => void;
}

export interface GanttTask {
  id: string;
  line: string;
  job: string;
  status: 'active' | 'locked' | 'pending';
  startPct: number;
  widthPct: number;
}

export interface MrpItem {
  name: string;
  demand: number;
  stock: number;
  status: 'ok' | 'shortage' | 'tight';
}