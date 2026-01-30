import React from 'react';
import { ViewType, KpiData } from '../types';
import { TrendingUp, TrendingDown, Activity, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

interface DashboardProps {
  onViewChange: (view: ViewType) => void;
}

const KPIS: KpiData[] = [
  {
    label: '综合质量良率 (Quality)',
    value: '99.2',
    unit: '%',
    trend: '↑ 0.1% 较上周',
    trendType: 'up',
    trendColor: 'success',
    borderColor: '#cfa972'
  },
  {
    label: '计划交付达成率 (OTD)',
    value: '96.8',
    unit: '%',
    trend: '↓ 1.2% 存在风险',
    trendType: 'down',
    trendColor: 'warning',
    borderColor: '#1a1a1a'
  },
  {
    label: '供应链风险指数',
    value: 'Low',
    unit: '',
    trend: '运行平稳',
    trendType: 'neutral',
    trendColor: 'success',
    borderColor: '#666666'
  },
  {
    label: 'AI 分析处理量',
    value: '12.5',
    unit: 'k',
    trend: '今日调用次数',
    trendType: 'neutral',
    trendColor: 'neutral',
    borderColor: '#e0e0e0'
  }
];

export const Dashboard: React.FC<DashboardProps> = ({ onViewChange }) => {
  return (
    <div className="container mx-auto px-10 py-8 max-w-[1440px]">
      {/* Hero Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-lx-black mb-2">理链智能体协作平台</h1>
        <p className="text-lx-textSub text-sm">理想汽车供应链协同中心 · 5大智能体实时在线</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        {KPIS.map((kpi, idx) => (
          <div 
            key={idx} 
            className="bg-white p-6 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 border-l-[3px] relative overflow-hidden group"
            style={{ borderLeftColor: kpi.borderColor }}
          >
            <div className="text-[13px] text-lx-textSub uppercase mb-2">{kpi.label}</div>
            <div className="text-3xl font-bold text-lx-black">
              {kpi.value}<span className="text-sm font-normal text-lx-textSub ml-1">{kpi.unit}</span>
            </div>
            <div className={`mt-2 text-xs flex items-center gap-1.5 ${
              kpi.trendColor === 'success' ? 'text-lx-success' : 
              kpi.trendColor === 'warning' ? 'text-lx-warning' : 'text-lx-textSub'
            }`}>
              {kpi.trend}
            </div>
          </div>
        ))}
      </div>

      {/* Section 1 */}
      <SectionDivider title="执行与监控" />
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <AgentCard 
            title="视觉大师"
            description="负责外观缺陷检测。覆盖金属件、漆面及装配间隙，自动拦截不良品。"
            imageUrl="/covers/视觉大师封面.png"
            status="normal"
            statusText="运行正常"
            onClick={() => onViewChange(ViewType.VISION)}
        />
        <AgentCard 
            title="听觉大师"
            description="负责 NVH 异响检测。识别电机啸叫与结构异响，确保产品声品质。"
            imageUrl="/covers/听觉大师封面.png"
            status="warning"
            statusText="波动预警"
            onClick={() => onViewChange(ViewType.AUDIO)}
        />
        <AgentCard 
            title="计划灵枢"
            description="集成 MRP、交付预测与主计划管理。平衡产能物料，计算最优排程。"
            imageUrl="/covers/计划灵枢.png"
            status="normal"
            statusText="计划锁定"
            onClick={() => onViewChange(ViewType.PLAN)}
        />
      </div>

      {/* Section 2 */}
      <SectionDivider title="分析与风控" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <AgentCard 
            title="风险小灵通"
            description="全球供应链风险扫描。监控地缘、物流及供应商财务合规风险。"
            imageUrl="/covers/风险小灵通.png"
            status="warning"
            statusText="2 项预警"
            onClick={() => onViewChange(ViewType.RISK)}
        />
        <AgentCard 
            title="质量分析师"
            description="AI 根因分析。基于大模型自动生成 8D 报告，提供质量改进建议。"
            imageUrl="/covers/质量分析师.png"
            status="analyzing"
            statusText="在线分析中"
            onClick={() => onViewChange(ViewType.QUALITY)}
        />
      </div>

    </div>
  );
};

const SectionDivider = ({ title }: { title: string }) => (
  <div className="flex items-center gap-3 mb-5 mt-2">
    <div className="text-base font-bold text-lx-black tracking-wider">{title}</div>
    <div className="flex-1 h-px bg-[#e0e0e0]"></div>
  </div>
);

const AgentCard = ({ title, description, imageUrl, status, statusText, onClick }: any) => (
  <div 
    onClick={onClick}
    className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer border border-transparent hover:border-lx-gold hover:-translate-y-1 flex flex-col h-[420px] group"
  >
    <div className="h-[200px] bg-[#1a1a1a] relative overflow-hidden">
      <img 
        src={imageUrl} 
        alt={title} 
        className="w-full h-full object-cover opacity-90 transition-all duration-500 group-hover:opacity-100 group-hover:scale-105 group-hover:grayscale-0 grayscale" 
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      <div className="absolute bottom-3 left-4 right-4 flex justify-between items-end opacity-0 group-hover:opacity-100 transition-opacity duration-300">
         <span className="text-[10px] text-white/80 border border-white/30 px-2 py-0.5 rounded backdrop-blur-sm">View Details</span>
      </div>
    </div>
    <div className="p-6 flex-1 flex flex-col">
      <h3 className="text-xl font-bold text-lx-black mb-2.5">{title}</h3>
      <p className="text-lx-textSub text-sm leading-relaxed flex-1">{description}</p>
      <div className="pt-5 border-t border-gray-100 flex justify-between items-center text-sm mt-auto">
        <div className={`flex items-center gap-1.5 ${
            status === 'normal' ? 'text-lx-success' :
            status === 'warning' ? 'text-lx-warning' : 'text-lx-success'
        }`}>
            {status === 'analyzing' && <Loader2 size={12} className="animate-spin" />}
            {status !== 'analyzing' && <div className="w-2 h-2 rounded-full bg-current" />}
            {statusText}
        </div>
        <span className="text-lx-gold font-medium group-hover:translate-x-1 transition-transform">进入智能体 →</span>
      </div>
    </div>
  </div>
);

