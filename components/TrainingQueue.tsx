import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, Loader2, AlertCircle, Play, X } from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import { ErrorHandler } from '../utils/errorHandler';

interface QueueTask {
  task_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'stopped';
  created_at: string;
  start_time?: string;
  end_time?: string;
  project_name: string;
  config: any;
  metrics?: any;
  error?: string;
  cancelled_at?: string;
}

interface QueueStatus {
  queue_size: number;
  is_training: boolean;
  current_task?: string;
  history: QueueTask[];
}

export const TrainingQueue: React.FC = () => {
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 自动刷新队列状态
  useEffect(() => {
    fetchQueueStatus();
    const interval = setInterval(fetchQueueStatus, 3000); // 每3秒刷新
    return () => clearInterval(interval);
  }, []);

  const fetchQueueStatus = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.TRAINING.QUEUE_STATUS);
      const data = await response.json();
      setQueueStatus(data);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch queue status:', error);
      setIsLoading(false);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    if (!confirm('确定要取消这个任务吗？')) return;

    try {
      const response = await fetch(`${API_ENDPOINTS.TRAINING.QUEUE_CANCEL}/${taskId}`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        ErrorHandler.handleSuccess('任务已取消');
        fetchQueueStatus();
      } else {
        ErrorHandler.handleAPIError({ response: { data } });
      }
    } catch (error) {
      ErrorHandler.handleAPIError(error);
    }
  };

  const getStatusIcon = (status: QueueTask['status']) => {
    switch (status) {
      case 'queued':
        return <Clock className="w-4 h-4 text-gray-400" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'cancelled':
        return <X className="w-4 h-4 text-gray-400" />;
      case 'stopped':
        return <AlertCircle className="w-4 h-4 text-orange-500" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: QueueTask['status']) => {
    const statusMap = {
      queued: '等待中',
      running: '运行中',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消',
      stopped: '已停止'
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status: QueueTask['status']) => {
    const colorMap = {
      queued: 'bg-gray-100 text-gray-700',
      running: 'bg-blue-100 text-blue-700',
      completed: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      cancelled: 'bg-gray-100 text-gray-500',
      stopped: 'bg-orange-100 text-orange-700'
    };
    return colorMap[status] || 'bg-gray-100 text-gray-700';
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const calculateDuration = (startTime?: string, endTime?: string) => {
    if (!startTime) return '-';
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : Date.now();
    const duration = Math.floor((end - start) / 1000); // 秒

    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = duration % 60;

    if (hours > 0) {
      return `${hours}时${minutes}分`;
    } else if (minutes > 0) {
      return `${minutes}分${seconds}秒`;
    } else {
      return `${seconds}秒`;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">加载中...</span>
      </div>
    );
  }

  if (!queueStatus) {
    return (
      <div className="text-center py-12 text-gray-500">
        无法加载队列状态
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Queue Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">训练队列状态</h3>
            <p className="text-sm text-gray-600">
              {queueStatus.is_training ? (
                <span className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-blue-500" />
                  正在训练: {queueStatus.current_task}
                </span>
              ) : (
                <span className="text-gray-500">当前没有训练任务运行</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-blue-600">{queueStatus.queue_size}</div>
            <div className="text-sm text-gray-600">等待中的任务</div>
          </div>
        </div>
      </div>

      {/* Task History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">任务历史</h3>
          <p className="text-sm text-gray-500 mt-1">显示最近50个训练任务</p>
        </div>

        {queueStatus.history.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            暂无训练任务
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">任务ID</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">项目名称</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">创建时间</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">耗时</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">指标</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {queueStatus.history.slice().reverse().map((task) => (
                  <tr key={task.task_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(task.status)}
                        <code className="text-sm font-mono text-gray-700">{task.task_id}</code>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{task.project_name}</div>
                      <div className="text-xs text-gray-500">
                        {task.config?.epochs || '-'} epochs · {task.config?.model_size || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
                        {getStatusText(task.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatTime(task.created_at)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {calculateDuration(task.start_time, task.end_time)}
                    </td>
                    <td className="px-6 py-4">
                      {task.metrics && task.metrics.mAP50 ? (
                        <div className="text-sm">
                          <span className="text-gray-600">mAP50: </span>
                          <span className="font-medium text-gray-900">{task.metrics.mAP50}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {task.status === 'queued' && (
                        <button
                          onClick={() => handleCancelTask(task.task_id)}
                          className="text-sm text-red-600 hover:text-red-700 font-medium"
                        >
                          取消
                        </button>
                      )}
                      {task.error && (
                        <button
                          onClick={() => alert(`错误信息:\n${task.error}`)}
                          className="text-sm text-gray-600 hover:text-gray-700 font-medium"
                        >
                          查看错误
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="text-xs text-gray-500 mb-2">状态说明：</div>
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-gray-400" />
            <span className="text-gray-600">等待中 - 任务在队列中等待执行</span>
          </div>
          <div className="flex items-center gap-1">
            <Loader2 className="w-3 h-3 text-blue-500" />
            <span className="text-gray-600">运行中 - 任务正在训练</span>
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-500" />
            <span className="text-gray-600">已完成 - 训练成功完成</span>
          </div>
          <div className="flex items-center gap-1">
            <XCircle className="w-3 h-3 text-red-500" />
            <span className="text-gray-600">失败 - 训练过程中出错</span>
          </div>
        </div>
      </div>
    </div>
  );
};
