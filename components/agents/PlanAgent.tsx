import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, AlertCircle, Calendar, Layers, Truck, BarChart2, Loader2, Sparkles,
  Package, AlertTriangle, TrendingUp, Clock, FileWarning,
  CheckCircle, XCircle, RefreshCw, ChevronRight, Filter, Search,
  Bot, Send, ChevronLeft, Bell, Eye, ExternalLink, MessageSquare, X
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';
import { optimizeSchedule } from '../../services/gemini';

// Tab 类型
type TabType = 'mps' | 'mrp' | 'exception';

// 消息类型
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: Array<{ label: string; action: string }>;
}

// 任务类型
interface Task {
  id: string;
  type: 'urgent' | 'todo' | 'warning' | 'suggestion';
  title: string;
  description: string;
  relatedId?: string;
  actions: Array<{ label: string; action: string }>;
  read: boolean;
  timestamp: Date;
}

// 周产量数据
const weeklyProductionData = [
  { name: 'W46', uv: 2000 },
  { name: 'W47', uv: 2800 },
  { name: 'W48', uv: 3500 },
  { name: 'W49(E)', uv: 4200 },
];

// MRP 物料需求数据
const mrpData = [
  { id: 'M001', material: 'Orin-X 芯片', category: '电子元器件', stock: 120, inTransit: 80, demand: 250, safetyStock: 50, gap: -50, supplier: '英伟达', leadTime: 14 },
  { id: 'M002', material: '电池包 BMS', category: '动力系统', stock: 200, inTransit: 100, demand: 280, safetyStock: 60, gap: -40, supplier: '宁德时代', leadTime: 7 },
  { id: 'M003', material: '车门总成', category: '车身件', stock: 450, inTransit: 200, demand: 400, safetyStock: 100, gap: 150, supplier: '敏实集团', leadTime: 5 },
  { id: 'M004', material: '座椅骨架', category: '内饰件', stock: 380, inTransit: 150, demand: 350, safetyStock: 80, gap: 100, supplier: '延锋安道拓', leadTime: 7 },
  { id: 'M005', material: '线束总成', category: '电气系统', stock: 520, inTransit: 180, demand: 500, safetyStock: 100, gap: 100, supplier: '安波福', leadTime: 10 },
  { id: 'M006', material: '铝合金轮毂', category: '底盘件', stock: 600, inTransit: 0, demand: 480, safetyStock: 120, gap: 0, supplier: '中信戴卡', leadTime: 5 },
];

// 供需平衡趋势数据
const supplyDemandTrend = [
  { week: 'W46', demand: 2200, supply: 2100, gap: -100 },
  { week: 'W47', demand: 2500, supply: 2400, gap: -100 },
  { week: 'W48', demand: 2800, supply: 2900, gap: 100 },
  { week: 'W49', demand: 3200, supply: 3000, gap: -200 },
  { week: 'W50', demand: 3500, supply: 3400, gap: -100 },
  { week: 'W51', demand: 3000, supply: 3200, gap: 200 },
];

// 异常采购订单数据
const exceptionOrders = [
  { 
    id: 'PO-2024-001', 
    material: 'Orin-X 芯片', 
    supplier: '英伟达', 
    quantity: 500, 
    originalDate: '2024-12-10', 
    expectedDate: '2024-12-18',
    delayDays: 8,
    type: 'delay', 
    impact: 'high',
    affectedLines: ['L7', 'L8'],
    affectedJobs: ['Job #A101', 'Job #B201'],
    status: 'pending'
  },
  { 
    id: 'PO-2024-002', 
    material: '电池包 BMS', 
    supplier: '宁德时代', 
    quantity: 200, 
    originalDate: '2024-12-12', 
    expectedDate: '2024-12-15',
    delayDays: 3,
    type: 'delay', 
    impact: 'medium',
    affectedLines: ['L7'],
    affectedJobs: ['Job #A102'],
    status: 'processing'
  },
  { 
    id: 'PO-2024-003', 
    material: '车门密封条', 
    supplier: '敏实集团', 
    quantity: 1000, 
    originalDate: '2024-12-08', 
    expectedDate: '2024-12-08',
    delayDays: 0,
    type: 'shortage', 
    shortageQty: 150,
    impact: 'low',
    affectedLines: ['L9'],
    affectedJobs: [],
    status: 'resolved'
  },
  { 
    id: 'PO-2024-004', 
    material: '座椅面料', 
    supplier: '延锋安道拓', 
    quantity: 800, 
    originalDate: '2024-12-14', 
    expectedDate: '2024-12-14',
    delayDays: 0,
    type: 'quality', 
    impact: 'medium',
    affectedLines: ['L8'],
    affectedJobs: ['Job #B201'],
    status: 'pending'
  },
  { 
    id: 'PO-2024-005', 
    material: '铝材', 
    supplier: '中铝集团', 
    quantity: 2000, 
    originalDate: '2024-12-11', 
    expectedDate: '2024-12-11',
    delayDays: 0,
    type: 'price', 
    priceIncrease: 8.5,
    impact: 'low',
    affectedLines: [],
    affectedJobs: [],
    status: 'pending'
  },
];

// 初始任务推送
const initialTasks: Task[] = [
  {
    id: 't1',
    type: 'urgent',
    title: 'Orin-X芯片延迟8天',
    description: '订单PO-2024-001延迟交付，影响L7/L8产线的Job #A101、#B201',
    relatedId: 'PO-2024-001',
    actions: [
      { label: '立即催单', action: 'expedite' },
      { label: '查看详情', action: 'view' }
    ],
    read: false,
    timestamp: new Date(Date.now() - 1000 * 60 * 5)
  },
  {
    id: 't2',
    type: 'todo',
    title: '3项异常订单待处理',
    description: '包含1项高优先级、2项中优先级订单需要关注',
    actions: [
      { label: '查看全部', action: 'viewAll' }
    ],
    read: false,
    timestamp: new Date(Date.now() - 1000 * 60 * 30)
  },
  {
    id: 't3',
    type: 'warning',
    title: 'W49周物料缺口预警',
    description: '预计缺口90件（Orin-X: 50, BMS: 40），建议提前采购',
    actions: [
      { label: '创建采购单', action: 'createPO' },
      { label: '查看MRP', action: 'viewMRP' }
    ],
    read: true,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2)
  },
  {
    id: 't4',
    type: 'suggestion',
    title: '排程优化建议',
    description: '调整L9产线排产顺序可提升产能约12%，预计增产150台/周',
    actions: [
      { label: '应用建议', action: 'apply' },
      { label: '查看分析', action: 'analyze' }
    ],
    read: true,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4)
  }
];

// 模拟AI回复
const mockAIResponses: Record<string, { content: string; actions?: Array<{ label: string; action: string }> }> = {
  '紧急': {
    content: '当前有1项紧急任务需要关注：\n\n📦 **PO-2024-001 (Orin-X芯片)** 延迟8天\n• 影响产线: L7、L8\n• 受影响工单: Job #A101、Job #B201\n• 预计影响产量: 约80台\n\n建议立即联系供应商催单，或启动备选供应商流程。',
    actions: [
      { label: '立即催单', action: 'expedite' },
      { label: '查看详情', action: 'view' }
    ]
  },
  '异常订单': {
    content: '本周异常订单统计：\n\n• 总数: 5项\n• 待处理: 3项\n• 处理中: 1项\n• 已解决: 1项\n\n按类型分布:\n🔴 交期延迟: 2项\n🟠 数量短缺: 1项\n🟣 质量异常: 1项\n🟡 价格波动: 1项',
    actions: [
      { label: '查看全部', action: 'viewAll' }
    ]
  },
  '物料缺口': {
    content: '本周物料缺口分析：\n\n**缺口物料: 2项**\n• Orin-X芯片: 缺口50件 (供应商: 英伟达)\n• 电池包BMS: 缺口40件 (供应商: 宁德时代)\n\n**预计影响:**\n• 产量损失: 约120台\n• 受影响产线: L7、L8\n\n建议提前3天触发采购，可避免断线风险。',
    actions: [
      { label: '创建采购单', action: 'createPO' },
      { label: '查看MRP详情', action: 'viewMRP' }
    ]
  },
  '催单': {
    content: '已向英伟达发送催单请求 ✓\n\n• 订单号: PO-2024-001\n• 物料: Orin-X芯片\n• 催单时间: ' + new Date().toLocaleTimeString() + '\n• 预计回复: 2小时内\n\n我会在收到供应商回复后第一时间通知您。'
  },
  '排程': {
    content: '当前排程状态：\n\n**L7总装线**: 运行中\n• 当前工单: Job #A101 (进度40%)\n• 下一工单: Job #A102\n\n**L8总装线**: 运行中\n• 当前工单: Job #B201 (进度50%)\n\n**L9总装线**: 维护中\n• 预计恢复: 明天上午\n• 待排产工单: 2项',
    actions: [
      { label: '优化排程', action: 'optimize' }
    ]
  },
  'default': {
    content: '我是计划灵枢智能助手，可以帮您：\n\n• 查询MPS排程、MRP物料需求\n• 分析异常订单和缺料风险\n• 执行催单、换源等操作\n• 提供排程优化建议\n\n请问有什么可以帮您？'
  }
};

export const PlanAgent = () => {
  const [activeTab, setActiveTab] = useState<TabType>('mps');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  
  // 智能助手状态
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm0',
      role: 'assistant',
      content: '您好！我是计划灵枢智能助手 🤖\n\n当前有 **1项紧急任务** 和 **2项待办事项** 需要您关注。\n\n有什么可以帮您的吗？',
      timestamp: new Date(Date.now() - 1000 * 60 * 10)
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleOptimization = async () => {
    setIsOptimizing(true);
    const result = await optimizeSchedule({
        productionLines: { L7: 'Active', L8: 'Active', L9: 'Maintenance' },
        shortages: ['Orin-X Chipset'],
        backlog: 120
    });
    setOptimizationResult(result);
    setIsOptimizing(false);
  };

  // 发送消息
  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: `m${Date.now()}`,
      role: 'user',
      content: inputValue,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // 模拟AI回复
    setTimeout(() => {
      const keywords = ['紧急', '异常订单', '物料缺口', '催单', '排程', '缺口', '缺料'];
      let response = mockAIResponses.default;
      
      for (const keyword of keywords) {
        if (inputValue.includes(keyword)) {
          response = mockAIResponses[keyword] || mockAIResponses.default;
          break;
        }
      }

      const aiMessage: Message = {
        id: `m${Date.now() + 1}`,
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
        actions: response.actions
      };
      setMessages(prev => [...prev, aiMessage]);
      setIsTyping(false);
    }, 1000);
  };

  // 处理任务操作
  const handleTaskAction = (taskId: string, action: string) => {
    if (action === 'view' || action === 'viewAll') {
      setActiveTab('exception');
    } else if (action === 'viewMRP' || action === 'createPO') {
      setActiveTab('mrp');
    } else if (action === 'expedite') {
      // 模拟催单
      const aiMessage: Message = {
        id: `m${Date.now()}`,
        role: 'assistant',
        content: mockAIResponses['催单'].content,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
    }
    
    // 标记任务为已读
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, read: true } : t));
  };

  // 获取任务图标和颜色
  const getTaskStyle = (type: Task['type']) => {
    const styles = {
      urgent: { icon: '🔴', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
      todo: { icon: '🟠', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
      warning: { icon: '🟡', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
      suggestion: { icon: '🟢', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' }
    };
    return styles[type];
  };

  // 获取异常类型标签
  const getExceptionTypeBadge = (type: string) => {
    const config: Record<string, { color: string; text: string; icon: React.ReactNode }> = {
      delay: { color: 'bg-red-100 text-red-700', text: '交期延迟', icon: <Clock size={12} /> },
      shortage: { color: 'bg-orange-100 text-orange-700', text: '数量短缺', icon: <Package size={12} /> },
      quality: { color: 'bg-purple-100 text-purple-700', text: '质量异常', icon: <AlertTriangle size={12} /> },
      price: { color: 'bg-yellow-100 text-yellow-700', text: '价格波动', icon: <TrendingUp size={12} /> },
    };
    const { color, text, icon } = config[type] || config.delay;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
        {icon} {text}
      </span>
    );
  };

  // 获取影响等级标签
  const getImpactBadge = (impact: string) => {
    const config: Record<string, string> = {
      high: 'bg-red-500 text-white',
      medium: 'bg-orange-500 text-white',
      low: 'bg-gray-200 text-gray-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${config[impact]}`}>
        {impact === 'high' ? '高' : impact === 'medium' ? '中' : '低'}
      </span>
    );
  };

  // 获取状态标签
  const getStatusBadge = (status: string) => {
    const config: Record<string, { color: string; text: string }> = {
      pending: { color: 'text-red-600', text: '待处理' },
      processing: { color: 'text-orange-600', text: '处理中' },
      resolved: { color: 'text-green-600', text: '已解决' },
    };
    const { color, text } = config[status] || config.pending;
    return <span className={`text-xs font-medium ${color}`}>{text}</span>;
  };

  // 统计数据
  const exceptionStats = {
    total: exceptionOrders.length,
    pending: exceptionOrders.filter(o => o.status === 'pending').length,
    highImpact: exceptionOrders.filter(o => o.impact === 'high').length,
  };

  const mrpStats = {
    shortage: mrpData.filter(m => m.gap < 0).length,
    totalGap: mrpData.filter(m => m.gap < 0).reduce((sum, m) => sum + Math.abs(m.gap), 0),
  };

  const unreadTasks = tasks.filter(t => !t.read).length;

  // 过滤异常订单
  const filteredOrders = filterType === 'all' 
    ? exceptionOrders 
    : exceptionOrders.filter(o => o.type === filterType);

  const tabs = [
    { id: 'mps' as TabType, label: 'MPS 主计划', icon: Calendar },
    { id: 'mrp' as TabType, label: 'MRP 物料计划', icon: Package },
    { id: 'exception' as TabType, label: '异常订单', icon: FileWarning, badge: exceptionStats.pending },
  ];

  return (
    <div className="pb-20 bg-lx-bgLight min-h-full flex">
      {/* 主内容区域 */}
      <div className={`flex-1 transition-all duration-300 ${assistantOpen ? 'mr-[360px]' : ''}`}>
        {/* Header */}
        <div className="bg-white pt-8 pb-6 px-10 border-b border-gray-200 shadow-sm z-10 relative mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold text-lx-black mb-1">计划灵枢 (Plan Pivot)</h1>
              <p className="text-lx-textSub text-sm">供应链计划协同中心 · MPS / MRP / 异常管理</p>
            </div>
            <div className="flex gap-3">
              <button className="text-lx-black bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                <Calendar size={16} /> 排程设置
              </button>
              <button 
                onClick={handleOptimization}
                disabled={isOptimizing}
                className="bg-lx-black hover:bg-lx-gold text-white px-5 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 font-medium shadow-md disabled:opacity-80"
              >
                {isOptimizing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                {isOptimizing ? 'AI 计算中...' : '运行智能排程'}
              </button>
            </div>
          </div>
          
          {/* Plan Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50 hover:bg-white hover:shadow-md transition-all cursor-default">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                <Layers size={20} />
              </div>
              <div>
                <div className="text-sm text-gray-500">计划达成率</div>
                <div className="text-xl font-bold text-lx-black">96.8% <span className="text-xs font-normal text-lx-warning">↓ 1.2%</span></div>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50 hover:bg-white hover:shadow-md transition-all cursor-default">
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                <Package size={20} />
              </div>
              <div>
                <div className="text-sm text-gray-500">物料齐套率</div>
                <div className="text-xl font-bold text-lx-black">92.5% <span className="text-xs font-normal text-lx-success">↑ 2.1%</span></div>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50 hover:bg-white hover:shadow-md transition-all cursor-default">
              <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
                <FileWarning size={20} />
              </div>
              <div>
                <div className="text-sm text-gray-500">异常订单</div>
                <div className="text-xl font-bold text-lx-black">{exceptionStats.pending} 项 <span className="text-xs font-normal text-lx-error">待处理</span></div>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50 hover:bg-white hover:shadow-md transition-all cursor-default">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                <AlertCircle size={20} />
              </div>
              <div>
                <div className="text-sm text-gray-500">缺料预警</div>
                <div className="text-xl font-bold text-lx-black">{mrpStats.shortage} 项 <span className="text-xs font-normal text-gray-400">缺口 {mrpStats.totalGap}</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-10 max-w-[1440px] space-y-6">
          
          {/* AI Insight Box */}
          {optimizationResult && (
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-6 text-white shadow-lg animate-in fade-in slide-in-from-top-4 flex gap-4">
              <div className="bg-white/10 p-3 rounded-full h-fit">
                <Sparkles className="text-lx-gold" size={24} />
              </div>
              <div>
                <h3 className="font-bold text-lx-gold mb-1">AI 优化建议</h3>
                <p className="text-sm text-gray-200 leading-relaxed">{optimizationResult}</p>
                <div className="mt-3 flex gap-3">
                  <button className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded transition-colors">应用建议</button>
                  <button onClick={() => setOptimizationResult(null)} className="text-xs text-gray-400 hover:text-white px-3 py-1.5 transition-colors">忽略</button>
                </div>
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="flex border-b border-gray-100">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative ${
                    activeTab === tab.id
                      ? 'text-lx-gold'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <tab.icon size={18} />
                  {tab.label}
                  {tab.badge && tab.badge > 0 && (
                    <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                      {tab.badge}
                    </span>
                  )}
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-lx-gold" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {/* MPS Tab */}
              {activeTab === 'mps' && (
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <div className="text-lg font-bold flex items-center gap-2 text-lx-black">
                        📅 主计划排程 (MPS)
                      </div>
                      <div className="flex gap-2">
                        <span className="px-2 py-1 rounded bg-gray-100 text-xs font-medium text-gray-600">Week 47 View</span>
                        <button className="text-lx-gold text-xs font-bold hover:underline">Full Schedule →</button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-[120px_1fr] gap-4 items-center">
                        <div className="text-right text-sm font-semibold text-gray-700">L7 总装线</div>
                        <div className="h-12 bg-gray-50 rounded-lg relative overflow-hidden flex items-center ring-1 ring-gray-100">
                          <div className="absolute h-8 top-2 bg-gradient-to-r from-lx-black to-lx-darkGrey text-white text-xs flex items-center pl-4 font-medium rounded shadow-sm" style={{ left: '0%', width: '40%' }}>
                            <span className="mr-2 opacity-60">RUNNING</span> Job #A101
                          </div>
                          <div className="absolute h-8 top-2 bg-lx-gold text-white text-xs flex items-center pl-4 font-medium rounded shadow-sm" style={{ left: '42%', width: '30%' }}>
                            Job #A102
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-[120px_1fr] gap-4 items-center">
                        <div className="text-right text-sm font-semibold text-gray-700">L8 总装线</div>
                        <div className="h-12 bg-gray-50 rounded-lg relative overflow-hidden flex items-center ring-1 ring-gray-100">
                          <div className="absolute h-8 top-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-xs flex items-center pl-4 font-medium rounded shadow-sm" style={{ left: '10%', width: '50%' }}>
                            <span className="mr-2 opacity-60">RUNNING</span> Job #B201
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-[120px_1fr] gap-4 items-center">
                        <div className="text-right text-sm font-semibold text-gray-700">L9 总装线</div>
                        <div className="h-12 bg-gray-50 rounded-lg relative overflow-hidden flex items-center ring-1 ring-gray-100">
                          <div className="absolute h-8 top-2 bg-orange-400 text-white text-xs flex items-center pl-4 font-medium rounded shadow-sm" style={{ left: '0%', width: '20%' }}>
                            🔧 维护中
                          </div>
                          <div className="absolute h-8 top-2 bg-gray-300 text-gray-600 text-xs flex items-center pl-4 font-medium rounded" style={{ left: '22%', width: '35%' }}>
                            待排产
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-6">
                    <div className="flex justify-between items-center mb-4">
                      <div className="text-lg font-bold flex items-center gap-2 text-lx-black">
                        <BarChart2 size={20} /> 周产量趋势
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={weeklyProductionData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                        <YAxis axisLine={false} tickLine={false} fontSize={12} />
                        <Tooltip />
                        <Bar dataKey="uv" radius={[4, 4, 0, 0]}>
                          {weeklyProductionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === weeklyProductionData.length - 1 ? '#C9A227' : '#1A1A1A'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* MRP Tab */}
              {activeTab === 'mrp' && (
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <div className="text-lg font-bold flex items-center gap-2 text-lx-black">
                        <TrendingUp size={20} /> 供需平衡趋势
                      </div>
                      <div className="flex gap-4 text-xs">
                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded"></span> 需求量</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded"></span> 供给量</span>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={supplyDemandTrend}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="week" axisLine={false} tickLine={false} fontSize={12} />
                        <YAxis axisLine={false} tickLine={false} fontSize={12} />
                        <Tooltip />
                        <Area type="monotone" dataKey="demand" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} name="需求量" />
                        <Area type="monotone" dataKey="supply" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} name="供给量" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="border-t border-gray-100 pt-6">
                    <div className="flex justify-between items-center mb-4">
                      <div className="text-lg font-bold flex items-center gap-2 text-lx-black">
                        <Package size={20} /> 物料需求计划
                      </div>
                      <div className="flex gap-2">
                        <div className="relative">
                          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input 
                            type="text" 
                            placeholder="搜索物料..." 
                            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-lx-gold/50"
                          />
                        </div>
                        <button className="flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                          <Filter size={14} /> 筛选
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left py-3 px-4 font-medium text-gray-500">物料编号</th>
                            <th className="text-left py-3 px-4 font-medium text-gray-500">物料名称</th>
                            <th className="text-left py-3 px-4 font-medium text-gray-500">分类</th>
                            <th className="text-right py-3 px-4 font-medium text-gray-500">现有库存</th>
                            <th className="text-right py-3 px-4 font-medium text-gray-500">在途数量</th>
                            <th className="text-right py-3 px-4 font-medium text-gray-500">需求量</th>
                            <th className="text-right py-3 px-4 font-medium text-gray-500">安全库存</th>
                            <th className="text-right py-3 px-4 font-medium text-gray-500">缺口</th>
                            <th className="text-left py-3 px-4 font-medium text-gray-500">供应商</th>
                            <th className="text-center py-3 px-4 font-medium text-gray-500">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mrpData.map((item) => (
                            <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                              <td className="py-3 px-4 font-mono text-gray-600">{item.id}</td>
                              <td className="py-3 px-4 font-medium text-gray-900">{item.material}</td>
                              <td className="py-3 px-4">
                                <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">{item.category}</span>
                              </td>
                              <td className="py-3 px-4 text-right">{item.stock}</td>
                              <td className="py-3 px-4 text-right text-blue-600">{item.inTransit > 0 ? `+${item.inTransit}` : '-'}</td>
                              <td className="py-3 px-4 text-right">{item.demand}</td>
                              <td className="py-3 px-4 text-right text-gray-400">{item.safetyStock}</td>
                              <td className={`py-3 px-4 text-right font-medium ${item.gap < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {item.gap > 0 ? `+${item.gap}` : item.gap}
                              </td>
                              <td className="py-3 px-4 text-gray-600">{item.supplier}</td>
                              <td className="py-3 px-4 text-center">
                                {item.gap < 0 && (
                                  <button className="text-xs text-lx-gold hover:underline font-medium">
                                    创建采购单
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Exception Orders Tab */}
              {activeTab === 'exception' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div className="flex gap-2">
                      {[
                        { id: 'all', label: '全部' },
                        { id: 'delay', label: '交期延迟' },
                        { id: 'shortage', label: '数量短缺' },
                        { id: 'quality', label: '质量异常' },
                        { id: 'price', label: '价格波动' },
                      ].map(filter => (
                        <button
                          key={filter.id}
                          onClick={() => setFilterType(filter.id)}
                          className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                            filterType === filter.id
                              ? 'bg-lx-black text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                    <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
                      <RefreshCw size={14} /> 刷新
                    </button>
                  </div>

                  <div className="space-y-3">
                    {filteredOrders.map((order) => (
                      <div 
                        key={order.id}
                        className={`bg-white border rounded-xl p-4 transition-all cursor-pointer ${
                          selectedOrder === order.id 
                            ? 'border-lx-gold ring-2 ring-lx-gold/20' 
                            : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
                        }`}
                        onClick={() => setSelectedOrder(selectedOrder === order.id ? null : order.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-mono text-sm text-gray-500">{order.id}</span>
                              {getExceptionTypeBadge(order.type)}
                              {getImpactBadge(order.impact)}
                              {getStatusBadge(order.status)}
                            </div>
                            <div className="flex items-center gap-6 text-sm">
                              <span className="font-medium text-gray-900">{order.material}</span>
                              <span className="text-gray-500">供应商: {order.supplier}</span>
                              <span className="text-gray-500">数量: {order.quantity}</span>
                              {order.type === 'delay' && (
                                <span className="text-red-600 font-medium">延迟 {order.delayDays} 天</span>
                              )}
                              {order.type === 'shortage' && (
                                <span className="text-orange-600 font-medium">短缺 {order.shortageQty} 件</span>
                              )}
                              {order.type === 'price' && (
                                <span className="text-yellow-600 font-medium">涨价 {order.priceIncrease}%</span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={20} className={`text-gray-400 transition-transform ${selectedOrder === order.id ? 'rotate-90' : ''}`} />
                        </div>

                        {selectedOrder === order.id && (
                          <div className="mt-4 pt-4 border-t border-gray-100">
                            <div className="grid grid-cols-2 gap-6">
                              <div>
                                <h4 className="text-sm font-medium text-gray-700 mb-2">交期信息</h4>
                                <div className="space-y-1 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">原交期</span>
                                    <span>{order.originalDate}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">预计交期</span>
                                    <span className={order.delayDays > 0 ? 'text-red-600' : ''}>{order.expectedDate}</span>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <h4 className="text-sm font-medium text-gray-700 mb-2">影响分析</h4>
                                <div className="space-y-1 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">受影响产线</span>
                                    <span>{order.affectedLines.length > 0 ? order.affectedLines.join(', ') : '-'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">受影响工单</span>
                                    <span>{order.affectedJobs.length > 0 ? order.affectedJobs.join(', ') : '-'}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            <div className="mt-4 flex gap-2">
                              {order.status !== 'resolved' && (
                                <>
                                  <button className="px-3 py-1.5 bg-lx-gold text-white text-sm rounded-lg hover:bg-lx-gold/90 flex items-center gap-1">
                                    <Truck size={14} /> 催单
                                  </button>
                                  <button className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-1">
                                    <RefreshCw size={14} /> 换源
                                  </button>
                                  <button className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 flex items-center gap-1">
                                    <Calendar size={14} /> 调整计划
                                  </button>
                                  <button className="px-3 py-1.5 text-red-600 text-sm rounded-lg hover:bg-red-50 flex items-center gap-1">
                                    <XCircle size={14} /> 取消订单
                                  </button>
                                </>
                              )}
                              {order.status === 'resolved' && (
                                <span className="flex items-center gap-1 text-green-600 text-sm">
                                  <CheckCircle size={14} /> 已解决
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 智能助手侧边栏 */}
      <div className={`fixed right-0 top-16 bottom-0 w-[360px] bg-white border-l border-gray-200 shadow-xl z-40 transition-transform duration-300 flex flex-col ${
        assistantOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* 助手头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-gray-900 to-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-lx-gold/20 flex items-center justify-center">
              <Bot size={20} className="text-lx-gold" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">智能助手</h3>
              <p className="text-xs text-gray-400">计划协同 AI 副驾驶</p>
            </div>
          </div>
          <button 
            onClick={() => setAssistantOpen(false)}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* 任务推送区 */}
        <div className="border-b border-gray-100">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">待办任务</span>
              {unreadTasks > 0 && (
                <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{unreadTasks}</span>
              )}
            </div>
            <button className="text-xs text-gray-500 hover:text-gray-700">全部已读</button>
          </div>
          
          <div className="max-h-[200px] overflow-y-auto">
            {tasks.slice(0, 3).map(task => {
              const style = getTaskStyle(task.type);
              return (
                <div 
                  key={task.id}
                  className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer ${!task.read ? 'bg-blue-50/30' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm">{style.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${style.text} truncate`}>{task.title}</span>
                        {!task.read && <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{task.description}</p>
                      <div className="flex gap-2 mt-2">
                        {task.actions.map((action, idx) => (
                          <button 
                            key={idx}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTaskAction(task.id, action.action);
                            }}
                            className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 对话区域 */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
            <MessageSquare size={14} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">对话</span>
          </div>
          
          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map(message => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${message.role === 'user' ? 'order-2' : ''}`}>
                  {message.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-lx-gold/20 flex items-center justify-center">
                        <Bot size={14} className="text-lx-gold" />
                      </div>
                      <span className="text-xs text-gray-400">助手</span>
                    </div>
                  )}
                  <div className={`rounded-xl px-3 py-2 text-sm ${
                    message.role === 'user' 
                      ? 'bg-lx-gold text-white rounded-br-sm' 
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                  {message.actions && message.actions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {message.actions.map((action, idx) => (
                        <button 
                          key={idx}
                          onClick={() => handleTaskAction('', action.action)}
                          className="text-xs px-2.5 py-1 bg-white border border-gray-200 hover:border-lx-gold hover:text-lx-gold rounded-lg transition-colors flex items-center gap-1"
                        >
                          {action.action === 'view' || action.action === 'viewAll' || action.action === 'viewMRP' ? <Eye size={12} /> : <ExternalLink size={12} />}
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className={`text-xs text-gray-400 mt-1 ${message.role === 'user' ? 'text-right' : ''}`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-xl px-4 py-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 输入框 */}
          <div className="p-3 border-t border-gray-100">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="输入问题，如：今天有什么紧急任务？"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-lx-gold/50 focus:border-lx-gold"
              />
              <button 
                onClick={handleSendMessage}
                disabled={!inputValue.trim()}
                className="px-3 py-2 bg-lx-gold text-white rounded-lg hover:bg-lx-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={18} />
              </button>
            </div>
            <div className="flex gap-2 mt-2">
              <button 
                onClick={() => setInputValue('今天有什么紧急任务？')}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors"
              >
                紧急任务
              </button>
              <button 
                onClick={() => setInputValue('本周物料缺口情况？')}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors"
              >
                物料缺口
              </button>
              <button 
                onClick={() => setInputValue('异常订单有多少？')}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors"
              >
                异常订单
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 助手展开按钮 */}
      {!assistantOpen && (
        <button
          onClick={() => setAssistantOpen(true)}
          className="fixed right-4 bottom-24 w-14 h-14 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-50"
        >
          <Bot size={24} className="text-lx-gold" />
          {unreadTasks > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {unreadTasks}
            </span>
          )}
        </button>
      )}
    </div>
  );
};
