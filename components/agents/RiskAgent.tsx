import React, { useState, useRef, useEffect } from 'react';
import { 
  Globe, AlertTriangle, ShieldCheck, Zap, Radio, Loader2, 
  ChevronDown, ChevronUp, Network, BarChart3, CheckCircle2,
  Send, Bot, User, Sparkles, TrendingDown, TrendingUp,
  Factory, Truck, Package, MapPin, Clock, ArrowRight,
  Filter, Download, RefreshCw, MoreHorizontal, X,
  Building2, AlertCircle, FileWarning, CloudLightning
} from 'lucide-react';
import ChinaMapReal, { MapNode } from '../ChinaMapReal';

// ============== 类型定义 ==============

type RiskLevel = 'high' | 'medium' | 'low';
type RiskType = '经营风险' | '质量风险' | '地缘政治' | '自然灾害';
type TaskStatus = '开启' | '处理中' | '已关闭' | '已完成';

interface SupplyNode {
  id: string;
  name: string;
  tier: 'T1' | 'T2' | 'T3';
  riskLevel: RiskLevel;
  province: string;
  city: string;
  products: string[];
  hasRisk?: boolean;
}

interface RiskItem {
  id: string;
  materialCode: string;
  materialName: string;
  riskType: RiskType;
  riskLevel: RiskLevel;
  supplier: string;
  status: TaskStatus;
  responsiblePerson: string;
  dueDate: string;
  description?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// ============== 模拟数据 ==============

// 供应网络节点数据 - 使用真实供应商名称
const SUPPLY_NODES: SupplyNode[] = [
  // T3 原材料供应商
  { id: 'v3001', name: '华虹半导体', tier: 'T3', riskLevel: 'low', province: '江苏省', city: '苏州', products: ['芯片原材料'] },
  { id: 'v3002', name: '立讯精密', tier: 'T3', riskLevel: 'low', province: '浙江省', city: '杭州', products: ['电子元件'] },
  { id: 'v3003', name: '深南电路', tier: 'T3', riskLevel: 'low', province: '广东省', city: '深圳', products: ['PCB板材'] },
  { id: 'v3004', name: '华友钴业', tier: 'T3', riskLevel: 'high', province: '湖北省', city: '武汉', products: ['电池原料'], hasRisk: true },
  { id: 'v3005', name: '金发科技', tier: 'T3', riskLevel: 'low', province: '四川省', city: '成都', products: ['塑料件'] },
  { id: 'v3006', name: '天齐锂业', tier: 'T3', riskLevel: 'low', province: '四川省', city: '遂宁', products: ['锂矿石'] },
  { id: 'v3007', name: '格林美', tier: 'T3', riskLevel: 'low', province: '湖北省', city: '荆门', products: ['镍钴材料'] },
  // T2 模组供应商
  { id: 'v2001', name: '蜂巢能源', tier: 'T2', riskLevel: 'low', province: '上海市', city: '上海', products: ['电池模组'] },
  { id: 'v2002', name: '汇川技术', tier: 'T2', riskLevel: 'low', province: '江苏省', city: '无锡', products: ['电机'] },
  { id: 'v2003', name: '华域汽车', tier: 'T2', riskLevel: 'low', province: '广东省', city: '广州', products: ['车身件'] },
  { id: 'v2004', name: '德赛西威', tier: 'T2', riskLevel: 'medium', province: '北京市', city: '北京', products: ['智能座舱'], hasRisk: true },
  { id: 'v2005', name: '均胜电子', tier: 'T2', riskLevel: 'low', province: '浙江省', city: '宁波', products: ['安全系统'] },
  { id: 'v2006', name: '拓普集团', tier: 'T2', riskLevel: 'low', province: '浙江省', city: '宁波', products: ['底盘件'] },
  { id: 'v2007', name: '三花智控', tier: 'T2', riskLevel: 'low', province: '浙江省', city: '绍兴', products: ['热管理'] },
  // T1 总成供应商
  { id: 'v1001', name: '宁德时代', tier: 'T1', riskLevel: 'low', province: '福建省', city: '宁德', products: ['电池包'] },
  { id: 'v1002', name: '精进电动', tier: 'T1', riskLevel: 'low', province: '浙江省', city: '宁波', products: ['驱动电机'] },
  { id: 'v1003', name: '宁波华翔', tier: 'T1', riskLevel: 'low', province: '广东省', city: '佛山', products: ['底盘总成'] },
  { id: 'v1004', name: '地平线', tier: 'T1', riskLevel: 'low', province: '上海市', city: '上海', products: ['车载系统'] },
  { id: 'v1005', name: '博格华纳', tier: 'T1', riskLevel: 'high', province: '天津市', city: '天津', products: ['变速箱'], hasRisk: true },
  { id: 'v1006', name: '采埃孚', tier: 'T1', riskLevel: 'low', province: '上海市', city: '上海', products: ['转向系统'] },
];

// 风险物料数据
const RISK_MATERIALS: RiskItem[] = [
  { id: 'r001', materialCode: 'M001', materialName: '动力电池芯片', riskType: '经营风险', riskLevel: 'high', supplier: '供应商A', status: '处理中', responsiblePerson: '张三', dueDate: '2024-06-01', description: '供应商产能不足' },
  { id: 'r002', materialCode: 'M002', materialName: '电池包组件', riskType: '质量风险', riskLevel: 'high', supplier: '供应商B', status: '开启', responsiblePerson: '李四', dueDate: '2024-06-02', description: '质检不合格率上升' },
  { id: 'r003', materialCode: 'M003', materialName: '变速器零件', riskType: '地缘政治', riskLevel: 'medium', supplier: '供应商C', status: '处理中', responsiblePerson: '王五', dueDate: '2024-06-05', description: '进口受限' },
  { id: 'r004', materialCode: 'M004', materialName: '车载芯片', riskType: '自然灾害', riskLevel: 'high', supplier: '供应商D', status: '开启', responsiblePerson: '赵六', dueDate: '2024-06-03', description: '台风影响物流' },
  { id: 'r005', materialCode: 'M005', materialName: '座舱控制器', riskType: '经营风险', riskLevel: 'medium', supplier: '供应商E', status: '已关闭', responsiblePerson: '钱七', dueDate: '2024-05-28', description: '已切换备选供应商' },
  { id: 'r006', materialCode: 'M006', materialName: '线束组件', riskType: '质量风险', riskLevel: 'low', supplier: '供应商F', status: '开启', responsiblePerson: '孙八', dueDate: '2024-06-10', description: '轻微工艺问题' },
];

// 待办任务
const TODO_TASKS = [
  { id: 't001', description: '跟进M001动力电池芯片供应商产能问题', level: 'high', responsiblePerson: '张三', dueDate: '2024-06-01', status: '待确认' },
  { id: 't002', description: '评估电池包组件备选供应商', level: 'medium', responsiblePerson: '李四', dueDate: '2024-06-02', status: '处理中' },
  { id: 't003', description: '协调变速器零件进口通关', level: 'medium', responsiblePerson: '王五', dueDate: '2024-06-02', status: '待确认' },
  { id: 't004', description: '车载芯片物流方案调整', level: 'high', responsiblePerson: '赵六', dueDate: '2024-06-03', status: '已完成' },
  { id: 't005', description: '完成华友钴业备选供应商评估报告', level: 'high', responsiblePerson: '周九', dueDate: '2024-06-04', status: '开启' },
  { id: 't006', description: '博格华纳变速箱产能协调会议', level: 'high', responsiblePerson: '吴十', dueDate: '2024-06-05', status: '处理中' },
];

// 地图节点（用于风险看板）
const MAP_NODES: MapNode[] = [
  { id: 'changzhou', name: '常州工厂', lon: 119.97, lat: 31.79, type: 'factory', status: 'normal' },
  { id: 'shanghai', name: '上海供应商', lon: 121.47, lat: 31.23, type: 'supplier', status: 'normal' },
  { id: 'shenzhen', name: '深圳供应商', lon: 114.07, lat: 22.54, type: 'supplier', status: 'warning' },
  { id: 'wuhan', name: '武汉供应商', lon: 114.30, lat: 30.59, type: 'supplier', status: 'high' },
  { id: 'beijing', name: '北京供应商', lon: 116.41, lat: 39.90, type: 'supplier', status: 'warning' },
  { id: 'chengdu', name: '成都供应商', lon: 104.07, lat: 30.67, type: 'supplier', status: 'normal' },
  { id: 'tianjin', name: '天津供应商', lon: 117.20, lat: 39.13, type: 'supplier', status: 'high' },
];

// ============== 子组件 ==============

// KPI 仪表盘
const GaugeMeter: React.FC<{ value: number; max: number; label: string; trend?: number; color?: string }> = ({ 
  value, max, label, trend, color = '#cfa972' 
}) => {
  const percentage = (value / max) * 100;
  const rotation = (percentage / 100) * 180 - 90;
  
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-16 overflow-hidden">
        <div className="absolute inset-0 border-8 border-gray-200 rounded-t-full" style={{ borderBottom: 'none' }}></div>
        <div 
          className="absolute inset-0 border-8 rounded-t-full transition-all duration-500"
          style={{ 
            borderColor: color,
            borderBottom: 'none',
            clipPath: `polygon(0 100%, 0 0, ${Math.min(percentage, 50)}% 0, ${Math.min(percentage, 50)}% 100%)` 
          }}
        ></div>
        {percentage > 50 && (
          <div 
            className="absolute inset-0 border-8 rounded-t-full"
            style={{ 
              borderColor: color,
              borderBottom: 'none',
              clipPath: `polygon(50% 100%, 50% 0, ${percentage}% 0, ${percentage}% 100%)` 
            }}
          ></div>
        )}
      </div>
      <div className="text-center -mt-2">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        {trend !== undefined && (
          <div className={`text-xs flex items-center justify-center gap-1 ${trend >= 0 ? 'text-red-500' : 'text-green-500'}`}>
            {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {trend >= 0 ? '+' : ''}{trend}%
          </div>
        )}
      </div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
};

// 横向条形图
const HorizontalBarChart: React.FC<{ data: { label: string; value: number; color?: string }[]; maxValue?: number }> = ({ 
  data, maxValue 
}) => {
  const max = maxValue || Math.max(...data.map(d => d.value));
  
  return (
    <div className="space-y-2">
      {data.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <div className="w-16 text-xs text-gray-600 truncate">{item.label}</div>
          <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
            <div 
              className="h-full rounded transition-all duration-500"
              style={{ 
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color || '#ef4444'
              }}
            ></div>
          </div>
          <div className="w-8 text-xs text-gray-600 text-right">{item.value}</div>
        </div>
      ))}
    </div>
  );
};

// 风险类型统计柱状图
const RiskTypeChart: React.FC<{ data: { type: string; high: number; medium: number; low: number }[] }> = ({ data }) => {
  const maxValue = Math.max(...data.map(d => d.high + d.medium + d.low));
  
  return (
    <div className="flex items-end justify-around h-40 px-4">
      {data.map((item, idx) => (
        <div key={idx} className="flex flex-col items-center">
          <div className="flex flex-col-reverse h-32 w-10">
            <div 
              className="bg-green-500 w-full transition-all duration-300"
              style={{ height: `${(item.low / maxValue) * 100}%` }}
            ></div>
            <div 
              className="bg-yellow-500 w-full transition-all duration-300"
              style={{ height: `${(item.medium / maxValue) * 100}%` }}
            ></div>
            <div 
              className="bg-red-500 w-full rounded-t transition-all duration-300"
              style={{ height: `${(item.high / maxValue) * 100}%` }}
            ></div>
          </div>
          <div className="text-xs text-gray-600 mt-2 text-center w-16 truncate">{item.type}</div>
        </div>
      ))}
    </div>
  );
};

// 供应链拓扑图
const SupplyChainTopology: React.FC<{ nodes: SupplyNode[]; selectedNode: string | null; onNodeClick: (id: string) => void }> = ({
  nodes, selectedNode, onNodeClick
}) => {
  const t3Nodes = nodes.filter(n => n.tier === 'T3');
  const t2Nodes = nodes.filter(n => n.tier === 'T2');
  const t1Nodes = nodes.filter(n => n.tier === 'T1');
  
  const vehicles = ['车型X01', '车型X02', '车型X03', '车型X04'];
  const factories = ['工厂01', '工厂02', '工厂03'];

  const NodeBox: React.FC<{ node: SupplyNode; isSelected: boolean }> = ({ node, isSelected }) => (
    <div 
      className={`px-3 py-1.5 rounded text-xs cursor-pointer transition-all border ${
        node.hasRisk 
          ? 'bg-red-50 border-red-300 text-red-700' 
          : isSelected 
            ? 'bg-amber-50 border-amber-400 text-amber-800' 
            : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
      }`}
      onClick={() => onNodeClick(node.id)}
    >
      <div className="flex items-center gap-1">
        {node.hasRisk && <AlertCircle size={12} className="text-red-500" />}
        <span>{node.name}</span>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 overflow-x-auto">
      <div className="flex items-start justify-between min-w-[900px] gap-4">
        {/* T3 */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm font-semibold text-gray-700 mb-2 px-3 py-1 bg-gray-100 rounded">T3</div>
          <div className="space-y-2">
            {t3Nodes.map(node => (
              <NodeBox key={node.id} node={node} isSelected={selectedNode === node.id} />
            ))}
          </div>
        </div>
        
        {/* Arrow */}
        <div className="flex items-center self-center text-gray-300">
          <div className="w-16 h-px bg-gray-300"></div>
          <ArrowRight size={16} />
        </div>
        
        {/* T2 */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm font-semibold text-gray-700 mb-2 px-3 py-1 bg-gray-100 rounded">T2</div>
          <div className="space-y-2">
            {t2Nodes.map(node => (
              <NodeBox key={node.id} node={node} isSelected={selectedNode === node.id} />
            ))}
          </div>
        </div>
        
        {/* Arrow */}
        <div className="flex items-center self-center text-gray-300">
          <div className="w-16 h-px bg-gray-300"></div>
          <ArrowRight size={16} />
        </div>
        
        {/* T1 */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm font-semibold text-gray-700 mb-2 px-3 py-1 bg-gray-100 rounded">T1</div>
          <div className="space-y-2">
            {t1Nodes.map(node => (
              <NodeBox key={node.id} node={node} isSelected={selectedNode === node.id} />
            ))}
          </div>
        </div>
        
        {/* Arrow */}
        <div className="flex items-center self-center text-gray-300">
          <div className="w-16 h-px bg-gray-300"></div>
          <ArrowRight size={16} />
        </div>
        
        {/* 车型 */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm font-semibold text-gray-700 mb-2 px-3 py-1 bg-blue-100 text-blue-700 rounded">车型</div>
          <div className="space-y-2">
            {vehicles.map((v, idx) => (
              <div key={idx} className="px-3 py-1.5 rounded text-xs bg-blue-50 border border-blue-200 text-blue-700">
                {v}
              </div>
            ))}
          </div>
        </div>
        
        {/* Arrow */}
        <div className="flex items-center self-center text-gray-300">
          <div className="w-16 h-px bg-gray-300"></div>
          <ArrowRight size={16} />
        </div>
        
        {/* 工厂 */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm font-semibold text-gray-700 mb-2 px-3 py-1 bg-green-100 text-green-700 rounded">工厂</div>
          <div className="space-y-2">
            {factories.map((f, idx) => (
              <div key={idx} className="px-3 py-1.5 rounded text-xs bg-green-50 border border-green-200 text-green-700 flex items-center gap-1">
                <Factory size={12} />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// 风险等级标签
const RiskLevelBadge: React.FC<{ level: RiskLevel }> = ({ level }) => {
  const config = {
    high: { bg: 'bg-red-100', text: 'text-red-700', label: '高' },
    medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '中' },
    low: { bg: 'bg-green-100', text: 'text-green-700', label: '低' }
  };
  const c = config[level];
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>{c.label}</span>;
};

// 状态标签
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { bg: string; text: string }> = {
    '开启': { bg: 'bg-blue-100', text: 'text-blue-700' },
    '处理中': { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    '已关闭': { bg: 'bg-gray-100', text: 'text-gray-600' },
    '已完成': { bg: 'bg-green-100', text: 'text-green-700' },
    '待确认': { bg: 'bg-orange-100', text: 'text-orange-700' }
  };
  const c = config[status] || { bg: 'bg-gray-100', text: 'text-gray-600' };
  return <span className={`px-2 py-0.5 rounded text-xs ${c.bg} ${c.text}`}>{status}</span>;
};

// ============== 主组件 ==============

export const RiskAgent = () => {
  const [activeTab, setActiveTab] = useState<'supply' | 'risk' | 'closure'>('risk');
  const [isScanning, setIsScanning] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isAiPanelCollapsed, setIsAiPanelCollapsed] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: '您好！我是风险小灵通AI助手，可以帮您分析供应链风险、查询供应商状态、解读预警信息。请问有什么可以帮您的？',
      timestamp: new Date()
    }
  ]);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // 处理全局扫描
  const handleScan = async () => {
    setIsScanning(true);
    // 模拟扫描
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsScanning(false);
  };

  // 处理 AI 对话
  const handleSendMessage = async () => {
    if (!chatInput.trim() || isAiThinking) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput,
      timestamp: new Date()
    };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsAiThinking(true);

    // 模拟 AI 响应
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const responses: Record<string, string> = {
      '高风险': `当前共有 **3个高风险物料**：\n\n1. **M001 动力电池芯片** - 供应商产能不足，影响电池包生产\n2. **M002 电池包组件** - 质检不合格率上升至8%\n3. **M004 车载芯片** - 台风影响华南物流\n\n建议优先处理M001，已影响2条产线。`,
      '武汉': `**武汉供应商风险详情**：\n\n- 供应商：Vendor 3004\n- 风险等级：🔴 高\n- 风险类型：自然灾害\n- 影响物料：电池原料\n- 影响范围：T2供应商2家，T1供应商1家\n\n当前状态：暴雨导致物流中断，预计48小时恢复。建议启用备用供应商。`,
      '供应链': `**华东区域供应链分析**：\n\n- 总供应商数：47家\n- 高风险：2家 (4.3%)\n- 中风险：5家 (10.6%)\n- 低风险：40家 (85.1%)\n\n主要风险集中在电池和芯片领域，建议加强该领域的供应商多元化。`,
    };

    let responseText = '我正在分析您的问题，这涉及到供应链风险评估。根据当前数据，建议您关注高风险物料的处理进度，并及时跟进待办任务。如需详细分析，请告诉我具体的物料编号或供应商名称。';
    
    for (const [keyword, response] of Object.entries(responses)) {
      if (chatInput.includes(keyword)) {
        responseText = response;
        break;
      }
    }

    const aiMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: responseText,
      timestamp: new Date()
    };
    setChatMessages(prev => [...prev, aiMessage]);
    setIsAiThinking(false);
  };

  // 快捷问题
  const quickQuestions = [
    '查看高风险物料',
    '武汉供应商详情',
    '分析供应链风险'
  ];

  // 统计数据
  const highRiskCount = RISK_MATERIALS.filter(r => r.riskLevel === 'high').length;
  const totalRiskCount = RISK_MATERIALS.length;
  const closedCount = RISK_MATERIALS.filter(r => r.status === '已关闭' || r.status === '已完成').length;
  const closureRate = Math.round((closedCount / totalRiskCount) * 100) / 100;

  // 风险类型统计
  const riskTypeData = [
    { type: '经营风险', high: 2, medium: 3, low: 2 },
    { type: '质量风险', high: 1, medium: 2, low: 3 },
    { type: '地缘政治', high: 1, medium: 1, low: 1 },
    { type: '自然灾害', high: 2, medium: 1, low: 0 }
  ];

  // Top 风险物料
  const topRiskMaterials = RISK_MATERIALS
    .filter(r => r.riskLevel === 'high' || r.riskLevel === 'medium')
    .slice(0, 5)
    .map(r => ({ label: r.materialCode, value: r.riskLevel === 'high' ? 25 : 15, color: r.riskLevel === 'high' ? '#ef4444' : '#eab308' }));

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Globe className="text-amber-500" size={24} />
              风险小灵通
            </h1>
            <p className="text-sm text-gray-500">供应链风险监控 · BIA分析 · 闭环管理</p>
          </div>
          <button 
            onClick={handleScan}
            disabled={isScanning}
            className="bg-gray-900 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 disabled:opacity-70"
          >
            {isScanning ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {isScanning ? '扫描中...' : '全局扫描'}
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <ShieldCheck size={16} className="text-green-500" />
              供应链韧性指数
            </div>
            <div className="text-2xl font-bold text-gray-900">92.4<span className="text-sm font-normal text-gray-400">/100</span></div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <AlertTriangle size={16} className="text-red-500" />
              高风险物料
            </div>
            <div className="text-2xl font-bold text-gray-900">{highRiskCount} <span className="text-xs text-red-500">+2</span></div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <FileWarning size={16} className="text-yellow-500" />
              总风险数量
            </div>
            <div className="text-2xl font-bold text-gray-900">{totalRiskCount} <span className="text-xs text-green-500">-16%</span></div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <CheckCircle2 size={16} className="text-blue-500" />
              闭环率
            </div>
            <div className="text-2xl font-bold text-gray-900">{closureRate}</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Content Area */}
        <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${isAiPanelCollapsed ? '' : 'mr-80'}`}>
          {/* Tab Navigation */}
          <div className="bg-white border-b border-gray-200 px-6 flex-shrink-0">
            <div className="flex gap-1">
              {[
                { id: 'supply' as const, label: '供应网络', icon: Network },
                { id: 'risk' as const, label: '风险看板', icon: BarChart3 },
                { id: 'closure' as const, label: '闭环管理', icon: CheckCircle2 }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-amber-500 text-amber-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-auto p-6">
            {/* Tab 1: 供应网络 */}
            {activeTab === 'supply' && (
              <div className="space-y-6">
                {/* 供应链拓扑图 */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Network size={16} />
                    供应网络拓扑图
                  </h3>
                  <SupplyChainTopology 
                    nodes={SUPPLY_NODES} 
                    selectedNode={selectedNode} 
                    onNodeClick={setSelectedNode} 
                  />
                </div>

                {/* 供应商列表 */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Building2 size={16} />
                      供应商清单
                    </h3>
                    <div className="flex gap-2">
                      <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                        <Filter size={14} /> 筛选
                      </button>
                      <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                        <Download size={14} /> 导出
                      </button>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">供应商</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">层级</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">区域</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">供应物料</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">风险等级</th>
                        </tr>
                      </thead>
                      <tbody>
                        {SUPPLY_NODES.slice(0, 8).map(node => (
                          <tr 
                            key={node.id} 
                            className={`border-t border-gray-100 hover:bg-gray-50 cursor-pointer ${
                              selectedNode === node.id ? 'bg-amber-50' : ''
                            }`}
                            onClick={() => setSelectedNode(node.id)}
                          >
                            <td className="px-4 py-2.5">{node.name}</td>
                            <td className="px-4 py-2.5">
                              <span className="px-2 py-0.5 rounded text-xs bg-gray-100">{node.tier}</span>
                            </td>
                            <td className="px-4 py-2.5 text-gray-600">{node.province} · {node.city}</td>
                            <td className="px-4 py-2.5 text-gray-600">{node.products.join(', ')}</td>
                            <td className="px-4 py-2.5"><RiskLevelBadge level={node.riskLevel} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 供应商详情卡片 */}
                {selectedNode && (
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700">供应商详情</h3>
                      <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600">
                        <X size={16} />
                      </button>
                    </div>
                    {(() => {
                      const node = SUPPLY_NODES.find(n => n.id === selectedNode);
                      if (!node) return null;
                      return (
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-gray-500">供应商名称</div>
                            <div className="font-medium">{node.name}</div>
                          </div>
                          <div>
                            <div className="text-gray-500">供应层级</div>
                            <div className="font-medium">{node.tier}</div>
                          </div>
                          <div>
                            <div className="text-gray-500">所在区域</div>
                            <div className="font-medium">{node.province} {node.city}</div>
                          </div>
                          <div>
                            <div className="text-gray-500">风险状态</div>
                            <RiskLevelBadge level={node.riskLevel} />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: 风险看板 */}
            {activeTab === 'risk' && (
              <div className="space-y-6">
                {/* 图表区域 */}
                <div className="grid grid-cols-3 gap-4">
                  {/* Top风险物料 */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-4">Top 风险物料</h4>
                    <HorizontalBarChart data={topRiskMaterials} maxValue={30} />
                  </div>

                  {/* 风险类型统计 */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-4">风险类型统计</h4>
                    <RiskTypeChart data={riskTypeData} />
                    <div className="flex justify-center gap-4 mt-2 text-xs">
                      <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded"></div>高</div>
                      <div className="flex items-center gap-1"><div className="w-3 h-3 bg-yellow-500 rounded"></div>中</div>
                      <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded"></div>低</div>
                    </div>
                  </div>

                  {/* 风险地图 */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">风险分布地图</h4>
                    <div className="aspect-[4/3] bg-gray-50 rounded relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <ChinaMapReal 
                          className="w-full h-full"
                          strokeColor="#d1d5db"
                          strokeWidth={0.3}
                          nodes={MAP_NODES}
                          selectedNodeId={null}
                          onNodeClick={() => {}}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 风险清单表格 */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <AlertTriangle size={16} className="text-red-500" />
                      风险物料清单
                    </h3>
                    <div className="flex gap-2">
                      <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                        <Filter size={14} /> 筛选
                      </button>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">物料号</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">物料名称</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">风险类型</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">风险等级</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">供应商</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">状态</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">责任人</th>
                        </tr>
                      </thead>
                      <tbody>
                        {RISK_MATERIALS.map(item => (
                          <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-mono text-xs">{item.materialCode}</td>
                            <td className="px-4 py-2.5">{item.materialName}</td>
                            <td className="px-4 py-2.5">
                              <span className="flex items-center gap-1 text-gray-600">
                                {item.riskType === '经营风险' && <Building2 size={12} />}
                                {item.riskType === '质量风险' && <AlertCircle size={12} />}
                                {item.riskType === '地缘政治' && <Globe size={12} />}
                                {item.riskType === '自然灾害' && <CloudLightning size={12} />}
                                {item.riskType}
                              </span>
                            </td>
                            <td className="px-4 py-2.5"><RiskLevelBadge level={item.riskLevel} /></td>
                            <td className="px-4 py-2.5 text-gray-600">{item.supplier}</td>
                            <td className="px-4 py-2.5"><StatusBadge status={item.status} /></td>
                            <td className="px-4 py-2.5 text-gray-600">{item.responsiblePerson}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: 闭环管理 */}
            {activeTab === 'closure' && (
              <div className="space-y-6">
                {/* 闭环进度概览 */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-4">
                    <GaugeMeter value={72} max={100} label="闭环率" color="#22c55e" />
                    <div className="flex-1">
                      <div className="text-sm text-gray-500 mb-2">本周完成</div>
                      <div className="text-2xl font-bold text-gray-900">8 <span className="text-sm font-normal text-gray-400">/ 12</span></div>
                      <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: '67%' }}></div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">闭环进度矩阵</h4>
                    <RiskTypeChart data={[
                      { type: '经营', high: 1, medium: 2, low: 4 },
                      { type: '质量', high: 0, medium: 1, low: 3 },
                      { type: '地缘', high: 1, medium: 0, low: 1 },
                      { type: '灾害', high: 1, medium: 1, low: 2 }
                    ]} />
                  </div>

                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">处理时效</h4>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>高风险 (目标: 24h)</span>
                          <span className="text-green-600">平均 18h</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: '75%' }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>中风险 (目标: 72h)</span>
                          <span className="text-yellow-600">平均 65h</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-yellow-500 rounded-full" style={{ width: '90%' }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>低风险 (目标: 168h)</span>
                          <span className="text-green-600">平均 120h</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: '71%' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 待办任务清单 */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Clock size={16} className="text-amber-500" />
                      待办任务清单
                    </h3>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">任务描述</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">等级</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">责任人</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">截止日期</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">状态</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {TODO_TASKS.map(task => (
                          <tr key={task.id} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2.5">{task.description}</td>
                            <td className="px-4 py-2.5"><RiskLevelBadge level={task.level as RiskLevel} /></td>
                            <td className="px-4 py-2.5 text-gray-600">{task.responsiblePerson}</td>
                            <td className="px-4 py-2.5 text-gray-600">{task.dueDate}</td>
                            <td className="px-4 py-2.5"><StatusBadge status={task.status} /></td>
                            <td className="px-4 py-2.5">
                              <button className="text-amber-600 hover:text-amber-700 text-xs">处理</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right AI Panel */}
        <div className={`fixed right-0 top-16 bottom-0 w-80 bg-white border-l border-gray-200 flex flex-col transition-transform duration-300 ${
          isAiPanelCollapsed ? 'translate-x-full' : 'translate-x-0'
        }`}>
          {/* Panel Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <Bot size={16} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">AI 风险助手</h3>
                <p className="text-xs text-gray-500">智能分析 · 风险预警</p>
              </div>
            </div>
            <button 
              onClick={() => setIsAiPanelCollapsed(true)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          </div>

          {/* Chat Messages */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'user' 
                    ? 'bg-gray-200' 
                    : 'bg-gradient-to-br from-amber-400 to-orange-500'
                }`}>
                  {msg.role === 'user' ? <User size={14} className="text-gray-600" /> : <Bot size={14} className="text-white" />}
                </div>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-gray-100 text-gray-800'
                    : 'bg-amber-50 text-gray-800 border border-amber-100'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}
            {isAiThinking && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <Bot size={14} className="text-white" />
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <Loader2 size={16} className="animate-spin text-amber-500" />
                </div>
              </div>
            )}
          </div>

          {/* Quick Questions */}
          <div className="px-4 py-2 border-t border-gray-100">
            <div className="flex flex-wrap gap-1">
              {quickQuestions.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => setChatInput(q)}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="输入问题，如：查看高风险..."
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
              />
              <button
                onClick={handleSendMessage}
                disabled={!chatInput.trim() || isAiThinking}
                className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Collapsed AI Panel Toggle */}
        {isAiPanelCollapsed && (
          <button
            onClick={() => setIsAiPanelCollapsed(false)}
            className="fixed right-4 bottom-24 w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
          >
            <Bot size={20} />
          </button>
        )}
      </div>
    </div>
  );
};
