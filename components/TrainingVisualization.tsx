import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { TrendingUp, TrendingDown, Activity, Target } from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';

interface TrainingMetrics {
  metrics: {
    mAP50?: number;
    'mAP50-95'?: number;
    precision?: number;
    recall?: number;
    loss?: number;
  };
  history?: {
    epoch: number[];
    train_loss: number[];
    val_loss?: number[];
    mAP50: number[];
    'mAP50-95': number[];
  };
}

interface TrainingVisualizationProps {
  modelId: string;
}

export const TrainingVisualization: React.FC<TrainingVisualizationProps> = ({ modelId }) => {
  const [metrics, setMetrics] = useState<TrainingMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedChart, setSelectedChart] = useState<'loss' | 'mAP' | 'all'>('all');

  useEffect(() => {
    fetchMetrics();
  }, [modelId]);

  const fetchMetrics = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.MODELS.METRICS(modelId));
      const data = await response.json();
      setMetrics(data);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-2 text-gray-600">加载训练指标中...</span>
      </div>
    );
  }

  if (!metrics || !metrics.history) {
    return (
      <div className="text-center py-12">
        <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">暂无训练历史数据</p>
      </div>
    );
  }

  // 准备图表数据
  const chartData = metrics.history.epoch.map((epoch, index) => ({
    epoch: epoch + 1,
    train_loss: metrics.history!.train_loss[index],
    val_loss: metrics.history!.val_loss?.[index],
    mAP50: metrics.history!.mAP50[index],
    'mAP50-95': metrics.history!['mAP50-95'][index]
  }));

  // 计算趋势
  const lastMetrics = chartData[chartData.length - 1];
  const firstMetrics = chartData[0];

  const trends = {
    mAP50: lastMetrics.mAP50 - firstMetrics.mAP50,
    loss: lastMetrics.train_loss - firstMetrics.train_loss
  };

  return (
    <div className="space-y-6">
      {/* Chart Type Selector */}
      <div className="flex items-center justify-between bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900">训练曲线可视化</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedChart('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedChart === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setSelectedChart('loss')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedChart === 'loss'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Loss曲线
          </button>
          <button
            onClick={() => setSelectedChart('mAP')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedChart === 'mAP'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            mAP指标
          </button>
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="mAP50"
          value={lastMetrics.mAP50}
          trend={trends.mAP50}
          icon={<Target className="w-5 h-5" />}
          color="blue"
          format={(v) => (v * 100).toFixed(2) + '%'}
        />
        <MetricCard
          label="mAP50-95"
          value={lastMetrics['mAP50-95']}
          trend={lastMetrics['mAP50-95'] - firstMetrics['mAP50-95']}
          icon={<Target className="w-5 h-5" />}
          color="cyan"
          format={(v) => (v * 100).toFixed(2) + '%'}
        />
        <MetricCard
          label="Precision"
          value={metrics.metrics.precision}
          icon={<Activity className="w-5 h-5" />}
          color="green"
          format={(v) => (v * 100).toFixed(2) + '%'}
        />
        <MetricCard
          label="Recall"
          value={metrics.metrics.recall}
          icon={<Activity className="w-5 h-5" />}
          color="purple"
          format={(v) => (v * 100).toFixed(2) + '%'}
        />
      </div>

      {/* Loss Chart */}
      {(selectedChart === 'all' || selectedChart === 'loss') && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h4 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-500" />
            训练损失 (Loss)
          </h4>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="epoch"
                label={{ value: 'Epoch', position: 'insideBottom', offset: -5 }}
                stroke="#9ca3af"
              />
              <YAxis
                label={{ value: 'Loss', angle: -90, position: 'insideLeft' }}
                stroke="#9ca3af"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="train_loss"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="训练损失"
                activeDot={{ r: 5 }}
              />
              {metrics.history.val_loss && (
                <Line
                  type="monotone"
                  dataKey="val_loss"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="验证损失"
                  strokeDasharray="5 5"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* mAP Chart */}
      {(selectedChart === 'all' || selectedChart === 'mAP') && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h4 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            平均精度 (mAP)
          </h4>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorMap50" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="colorMap5095" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="epoch"
                label={{ value: 'Epoch', position: 'insideBottom', offset: -5 }}
                stroke="#9ca3af"
              />
              <YAxis
                label={{ value: 'mAP', angle: -90, position: 'insideLeft' }}
                stroke="#9ca3af"
                domain={[0, 1]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px'
                }}
                formatter={(value: number) => (value * 100).toFixed(2) + '%'}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="mAP50"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorMap50)"
                name="mAP50"
              />
              <Area
                type="monotone"
                dataKey="mAP50-95"
                stroke="#06b6d4"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorMap5095)"
                name="mAP50-95"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Training Progress Bar */}
      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-100">
        <h4 className="text-md font-semibold text-gray-900 mb-3">训练进度</h4>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Epoch {lastMetrics.epoch}</span>
              <span>{chartData.length} epochs 完成</span>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500"
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">
              {(lastMetrics.mAP50 * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500">mAP50</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Metric Card Component
interface MetricCardProps {
  label: string;
  value?: number;
  trend?: number;
  icon: React.ReactNode;
  color: 'blue' | 'cyan' | 'green' | 'purple';
  format?: (v: number) => string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  trend,
  icon,
  color,
  format = (v) => v.toFixed(4)
}) => {
  const colors = {
    blue: 'text-blue-600 bg-blue-50',
    cyan: 'text-cyan-600 bg-cyan-50',
    green: 'text-green-600 bg-green-50',
    purple: 'text-purple-600 bg-purple-50'
  };

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600">{label}</span>
        <div className={`p-2 rounded-lg ${colors[color]}`}>{icon}</div>
      </div>
      <div className="text-2xl font-bold text-gray-900">
        {value !== undefined ? format(value) : '-'}
      </div>
      {trend !== undefined && (
        <div className={`flex items-center gap-1 mt-1 text-sm ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {trend >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span>{Math.abs(trend * 100).toFixed(2)}%</span>
        </div>
      )}
    </div>
  );
};
