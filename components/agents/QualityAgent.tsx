import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Sparkles, FileText, User, Loader2, AlertTriangle, CheckCircle, XCircle,
  Package, TrendingUp, TrendingDown, Clock, ChevronRight, Filter, Search,
  Plus, Download, RefreshCw, AlertCircle, ArrowUpRight, MessageSquare,
  Shield, FileWarning, Ban, BarChart2, Bot, Bell, Eye, X, ExternalLink
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend, PieChart, Pie } from 'recharts';
import { createQualityChat } from '../../services/gemini';

// Tab 类型 - 移除 'ai' 因为现在是侧边栏
type TabType = 'dashboard' | 'hold' | 'cr' | 'qr';

// Hold 记录
interface HoldRecord {
  id: string;
  material: string;
  batch: string;
  quantity: number;
  reason: string;
  status: 'pending' | 'analyzing' | 'releasing' | 'released' | 'scrapped';
  location: string;
  owner: string;
  createdAt: string;
  releasedAt?: string;
  releaseConclusion?: string;
}

// CR 记录
interface CRRecord {
  id: string;
  supplier: string;
  material: string;
  defectType: string;
  description: string;
  urgency: 'low' | 'medium' | 'high';
  status: 'open' | 'responded' | '8d_progress' | 'reviewing' | 'closed' | 'escalated';
  d8Progress: number;
  responseDeadline: string;
  supplierFeedback?: string;
  createdAt: string;
  closedAt?: string;
  reviewer?: string;
}

// QR 记录
interface QRRecord {
  id: string;
  supplier: string;
  material: string;
  quantity: number;
  severity: 'critical' | 'major' | 'minor';
  defectDescription: string;
  lossAmount: number;
  resolution: 'return' | 'claim' | 'replace' | 'downgrade' | 'pending';
  status: 'open' | 'processing' | 'reviewing' | 'closed';
  d8Progress: number;
  createdAt: string;
}

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

// 模拟数据
const holdRecords: HoldRecord[] = [
  { id: 'HOLD-2024-0156', material: '电池包BMS模组', batch: 'BAT-20241215-003', quantity: 50, reason: '来料检验发现外观异常，疑似运输损伤', status: 'pending', location: '常州仓库-A3区', owner: '张工', createdAt: '2024-12-16 09:30' },
  { id: 'HOLD-2024-0155', material: '车门总成', batch: 'DOOR-20241214-001', quantity: 20, reason: '尺寸检验待确认', status: 'released', location: '常州仓库-B1区', owner: '李工', createdAt: '2024-12-14 14:20', releasedAt: '2024-12-15 16:45', releaseConclusion: '尺寸在公差范围内，允许使用' },
  { id: 'HOLD-2024-0154', material: 'Orin-X芯片', batch: 'ORN-20241213-002', quantity: 100, reason: '性能测试异常，需进一步分析', status: 'analyzing', location: '常州仓库-C2区', owner: '王工', createdAt: '2024-12-13 11:15' },
  { id: 'HOLD-2024-0153', material: '座椅面料', batch: 'SEAT-20241212-005', quantity: 200, reason: '色差超标', status: 'scrapped', location: '常州仓库-D1区', owner: '赵工', createdAt: '2024-12-12 08:45' },
];

const crRecords: CRRecord[] = [
  { id: 'CR-2024-0089', supplier: '英伟达', material: 'Orin-X芯片', defectType: '性能异常', description: '批次ORN-1215-A02的芯片在高温测试中出现性能波动', urgency: 'high', status: '8d_progress', d8Progress: 5, responseDeadline: '2024-12-17', supplierFeedback: '根因已定位为封装工艺温度控制偏差，正在制定永久措施...', createdAt: '2024-12-14' },
  { id: 'CR-2024-0088', supplier: '宁德时代', material: '电池包BMS', defectType: '通信异常', description: '通信协议偶发超时，影响数据采集', urgency: 'medium', status: 'closed', d8Progress: 8, responseDeadline: '2024-12-15', createdAt: '2024-12-10', closedAt: '2024-12-15', reviewer: '王工' },
  { id: 'CR-2024-0087', supplier: '敏实集团', material: '车门密封条', defectType: '外观缺陷', description: '表面存在气泡和划痕', urgency: 'low', status: 'reviewing', d8Progress: 8, responseDeadline: '2024-12-18', supplierFeedback: '8D报告已完成，请审核', createdAt: '2024-12-12' },
  { id: 'CR-2024-0086', supplier: '延锋安道拓', material: '座椅骨架', defectType: '尺寸偏差', description: '安装孔位偏移2mm', urgency: 'medium', status: 'open', d8Progress: 2, responseDeadline: '2024-12-20', createdAt: '2024-12-15' },
];

const qrRecords: QRRecord[] = [
  { id: 'QR-2024-0023', supplier: '某电子', material: '控制器PCB', quantity: 200, severity: 'critical', defectDescription: '批量焊接虚焊，导致功能失效率达15%', lossAmount: 85000, resolution: 'return', status: 'reviewing', d8Progress: 4, createdAt: '2024-12-15' },
  { id: 'QR-2024-0022', supplier: '某塑料', material: '内饰面板', quantity: 500, severity: 'major', defectDescription: '注塑缺陷，表面存在流痕', lossAmount: 25000, resolution: 'claim', status: 'processing', d8Progress: 6, createdAt: '2024-12-13' },
  { id: 'QR-2024-0021', supplier: '某金属', material: '铝合金支架', quantity: 100, severity: 'minor', defectDescription: '表面氧化斑点', lossAmount: 8000, resolution: 'downgrade', status: 'closed', d8Progress: 8, createdAt: '2024-12-10' },
];

// 趋势数据
const trendData = [
  { week: 'W42', hold: 8, cr: 5, qr: 1 },
  { week: 'W43', hold: 12, cr: 7, qr: 2 },
  { week: 'W44', hold: 10, cr: 4, qr: 1 },
  { week: 'W45', hold: 15, cr: 6, qr: 3 },
  { week: 'W46', hold: 11, cr: 8, qr: 2 },
  { week: 'W47', hold: 12, cr: 8, qr: 3 },
];

// 供应商质量排名
const supplierRanking = [
  { name: '某电子', issues: 15, trend: 'up' },
  { name: '英伟达', issues: 11, trend: 'up' },
  { name: '敏实集团', issues: 8, trend: 'down' },
  { name: '延锋安道拓', issues: 5, trend: 'same' },
  { name: '宁德时代', issues: 3, trend: 'down' },
];

// 缺陷类型分布
const defectDistribution = [
  { name: '外观缺陷', value: 42, color: '#f59e0b' },
  { name: '尺寸偏差', value: 28, color: '#3b82f6' },
  { name: '功能异常', value: 18, color: '#ef4444' },
  { name: '包装问题', value: 12, color: '#8b5cf6' },
];

// 初始任务推送
const initialTasks: Task[] = [
  {
    id: 'qt1',
    type: 'urgent',
    title: 'CR-2024-0089 响应即将超期',
    description: '英伟达CR单响应截止日期为明天，请及时跟进',
    relatedId: 'CR-2024-0089',
    actions: [
      { label: '查看CR', action: 'viewCR' },
      { label: '催促供应商', action: 'remind' }
    ],
    read: false,
    timestamp: new Date(Date.now() - 1000 * 60 * 5)
  },
  {
    id: 'qt2',
    type: 'warning',
    title: '供应商"某电子"质量预警',
    description: '本月已触发2次QR，建议关注其来料质量',
    relatedId: 'QR-2024-0023',
    actions: [
      { label: '查看QR', action: 'viewQR' },
      { label: '查看供应商', action: 'viewSupplier' }
    ],
    read: false,
    timestamp: new Date(Date.now() - 1000 * 60 * 30)
  },
  {
    id: 'qt3',
    type: 'todo',
    title: 'HOLD-0156 已超48小时未处理',
    description: '电池包BMS模组Hold单待分析，请尽快处理',
    relatedId: 'HOLD-2024-0156',
    actions: [
      { label: '查看Hold', action: 'viewHold' },
      { label: '开始分析', action: 'startAnalysis' }
    ],
    read: false,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2)
  },
  {
    id: 'qt4',
    type: 'suggestion',
    title: '8D报告待审核',
    description: 'CR-2024-0087 敏实集团已提交8D报告，请审核',
    relatedId: 'CR-2024-0087',
    actions: [
      { label: '查看8D', action: 'view8D' },
      { label: '审核通过', action: 'approve' }
    ],
    read: true,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4)
  }
];

// 模拟AI回复
const mockAIResponses: Record<string, { content: string; actions?: Array<{ label: string; action: string }> }> = {
  '本周质量': {
    content: '📊 **本周质量概况**\n\n• 新增 Hold: 5件 (↑2)\n• 新增 CR: 3件 (持平)\n• 新增 QR: 1件 (↑1)\n• 质量 PPM: 156 (↓12)\n\n主要问题集中在电子元器件类，建议重点关注英伟达和某电子两家供应商的来料质量。',
    actions: [
      { label: '查看详细报告', action: 'report' },
      { label: '导出周报', action: 'export' }
    ]
  },
  '超期': {
    content: '⚠️ **紧急/超期单据**\n\n1. CR-2024-0089 (英伟达)\n   • 状态: 8D进行中\n   • 响应截止: 明天\n   • 建议: 催促供应商加快进度\n\n2. HOLD-2024-0156\n   • 状态: 待分析\n   • 已超48小时未处理\n   • 建议: 尽快安排分析',
    actions: [
      { label: '查看CR', action: 'viewCR' },
      { label: '查看Hold', action: 'viewHold' }
    ]
  },
  '供应商': {
    content: '🏭 **供应商质量排名 (本月问题数)**\n\n1. 某电子 - 15件 ↑\n2. 英伟达 - 11件 ↑\n3. 敏实集团 - 8件 ↓\n4. 延锋安道拓 - 5件 →\n5. 宁德时代 - 3件 ↓\n\n建议对问题数上升的供应商进行专项审核。',
    actions: [
      { label: '查看供应商详情', action: 'viewSupplier' }
    ]
  },
  'Hold': {
    content: `🛑 **Hold 状态汇总**\n\n• 待分析: ${holdRecords.filter(h => h.status === 'pending').length}件\n• 分析中: ${holdRecords.filter(h => h.status === 'analyzing').length}件\n• 待释放: ${holdRecords.filter(h => h.status === 'releasing').length}件\n• 已释放: ${holdRecords.filter(h => h.status === 'released').length}件\n• 已报废: ${holdRecords.filter(h => h.status === 'scrapped').length}件`,
    actions: [
      { label: '查看Hold列表', action: 'viewHold' }
    ]
  },
  'CR': {
    content: `🟠 **CR 状态汇总**\n\n• 待响应: ${crRecords.filter(c => c.status === 'open').length}件\n• 8D进行中: ${crRecords.filter(c => c.status === '8d_progress').length}件\n• 待审核: ${crRecords.filter(c => c.status === 'reviewing').length}件\n• 已关闭: ${crRecords.filter(c => c.status === 'closed').length}件\n\n有1件高紧急度CR需要关注：CR-2024-0089`,
    actions: [
      { label: '查看CR列表', action: 'viewCR' }
    ]
  },
  'QR': {
    content: `🔴 **QR 状态汇总**\n\n• 待审核: ${qrRecords.filter(q => q.status === 'reviewing').length}件\n• 处理中: ${qrRecords.filter(q => q.status === 'processing').length}件\n• 已关闭: ${qrRecords.filter(q => q.status === 'closed').length}件\n\n本月预估损失金额: ¥${qrRecords.reduce((sum, q) => sum + q.lossAmount, 0).toLocaleString()}`,
    actions: [
      { label: '查看QR列表', action: 'viewQR' }
    ]
  },
  '分析': {
    content: '🔍 **根因分析建议**\n\n基于本周质量数据：\n\n1. **外观缺陷** (42%)\n   可能原因: 运输包装不当\n   建议: 加强供应商包装规范\n\n2. **尺寸偏差** (28%)\n   可能原因: 模具磨损\n   建议: 要求供应商检查模具状态\n\n3. **功能异常** (18%)\n   可能原因: 电子元器件批次问题\n   建议: 加强来料检验',
    actions: [
      { label: '生成分析报告', action: 'generateReport' }
    ]
  },
  'default': {
    content: '我是质量分析助手，可以帮您：\n\n• 查询 Hold/CR/QR 状态\n• 分析质量趋势和根因\n• 查看供应商质量排名\n• 生成质量报告\n\n请问有什么可以帮您？'
  }
};

interface ChatInstance {
  sendMessage: (message: string) => Promise<{ text: string }>;
}

export const QualityAgent = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [selectedHold, setSelectedHold] = useState<string | null>(null);
  const [selectedCR, setSelectedCR] = useState<string | null>(null);
  const [selectedQR, setSelectedQR] = useState<string | null>(null);
  const [holdFilter, setHoldFilter] = useState('all');
  const [crFilter, setCrFilter] = useState('all');
  const [qrFilter, setQrFilter] = useState('all');
  
  // 智能助手状态
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm0',
      role: 'assistant',
      content: '您好！我是质量分析助手 🤖\n\n当前有 **1项紧急CR** 和 **3项待处理Hold** 需要关注。\n\n我可以帮您：\n• 分析质量趋势和根因\n• 查询 Hold/CR/QR 状态\n• 生成质量报告\n\n请问有什么可以帮您？',
      timestamp: new Date(Date.now() - 1000 * 60 * 10)
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<ChatInstance | null>(null);

  useEffect(() => {
    chatRef.current = createQualityChat() as ChatInstance;
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 统计数据
  const stats = {
    hold: { total: holdRecords.filter(h => h.status !== 'released' && h.status !== 'scrapped').length, new: 2 },
    cr: { total: crRecords.filter(c => c.status !== 'closed').length, reviewing: crRecords.filter(c => c.status === 'reviewing').length },
    qr: { total: qrRecords.filter(q => q.status !== 'closed').length, new: 1 },
    ppm: 156
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
      const keywords = ['本周质量', '超期', '紧急', '供应商', 'Hold', 'hold', 'CR', 'cr', 'QR', 'qr', '分析', '排名'];
      let response = mockAIResponses.default;
      
      for (const keyword of keywords) {
        if (inputValue.toLowerCase().includes(keyword.toLowerCase())) {
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
    if (action === 'viewHold' || action === 'startAnalysis') {
      setActiveTab('hold');
    } else if (action === 'viewCR' || action === 'view8D' || action === 'approve' || action === 'remind') {
      setActiveTab('cr');
    } else if (action === 'viewQR' || action === 'viewSupplier') {
      setActiveTab('qr');
    }
    
    // 标记任务为已读
    if (taskId) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, read: true } : t));
    }
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

  // Hold 状态样式
  const getHoldStatusStyle = (status: HoldRecord['status']) => {
    const styles = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '待分析' },
      analyzing: { bg: 'bg-blue-100', text: 'text-blue-700', label: '分析中' },
      releasing: { bg: 'bg-purple-100', text: 'text-purple-700', label: '待释放' },
      released: { bg: 'bg-green-100', text: 'text-green-700', label: '已释放' },
      scrapped: { bg: 'bg-gray-100', text: 'text-gray-700', label: '已报废' },
    };
    return styles[status];
  };

  // CR 状态样式
  const getCRStatusStyle = (status: CRRecord['status']) => {
    const styles = {
      open: { bg: 'bg-red-100', text: 'text-red-700', label: '待响应' },
      responded: { bg: 'bg-blue-100', text: 'text-blue-700', label: '已响应' },
      '8d_progress': { bg: 'bg-orange-100', text: 'text-orange-700', label: '8D进行中' },
      reviewing: { bg: 'bg-purple-100', text: 'text-purple-700', label: '待审核' },
      closed: { bg: 'bg-green-100', text: 'text-green-700', label: '已关闭' },
      escalated: { bg: 'bg-red-100', text: 'text-red-700', label: '已升级QR' },
    };
    return styles[status];
  };

  // QR 严重等级样式
  const getSeverityStyle = (severity: QRRecord['severity']) => {
    const styles = {
      critical: { bg: 'bg-red-500', text: 'text-white', label: 'Critical' },
      major: { bg: 'bg-orange-500', text: 'text-white', label: 'Major' },
      minor: { bg: 'bg-gray-400', text: 'text-white', label: 'Minor' },
    };
    return styles[severity];
  };

  // 紧急程度样式
  const getUrgencyStyle = (urgency: CRRecord['urgency']) => {
    const styles = {
      high: { bg: 'bg-red-500', text: 'text-white', label: '紧急' },
      medium: { bg: 'bg-orange-500', text: 'text-white', label: '普通' },
      low: { bg: 'bg-gray-400', text: 'text-white', label: '低' },
    };
    return styles[urgency];
  };

  const unreadTasks = tasks.filter(t => !t.read).length;

  const tabs = [
    { id: 'dashboard' as TabType, label: '质量看板', icon: BarChart2 },
    { id: 'hold' as TabType, label: 'Hold管理', icon: Shield, badge: stats.hold.total },
    { id: 'cr' as TabType, label: 'CR审核', icon: FileWarning, badge: stats.cr.reviewing },
    { id: 'qr' as TabType, label: 'QR审核', icon: Ban, badge: stats.qr.total },
  ];

  return (
    <div className="pb-20 bg-lx-bgLight min-h-full flex">
      {/* 主内容区域 */}
      <div className={`flex-1 transition-all duration-300 ${assistantOpen ? 'mr-[360px]' : ''}`}>
       {/* Header */}
        <div className="bg-white pt-8 pb-6 px-10 border-b border-gray-200 shadow-sm z-10 relative mb-6">
          <div className="flex justify-between items-start mb-6">
         <div>
              <h1 className="text-2xl font-bold text-lx-black mb-1">质量分析师 (Quality Analyst)</h1>
              <p className="text-lx-textSub text-sm">供应链质量管控中心 · Hold / CR / QR</p>
         </div>
            <div className="flex items-center gap-2">
         <div className="bg-green-100 text-green-700 text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                在线
              </div>
         </div>
       </div>

          {/* 指标卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-4 p-4 rounded-xl border border-yellow-200 bg-yellow-50 hover:shadow-md transition-all cursor-pointer" onClick={() => setActiveTab('hold')}>
              <div className="w-12 h-12 rounded-full bg-yellow-200 text-yellow-700 flex items-center justify-center text-xl">
                🟡
              </div>
              <div>
                <div className="text-sm text-yellow-700 font-medium">Hold</div>
                <div className="text-2xl font-bold text-yellow-800">{stats.hold.total} <span className="text-xs font-normal">待处理</span></div>
                <div className="text-xs text-yellow-600">↑{stats.hold.new} 本周新增</div>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-xl border border-orange-200 bg-orange-50 hover:shadow-md transition-all cursor-pointer" onClick={() => setActiveTab('cr')}>
              <div className="w-12 h-12 rounded-full bg-orange-200 text-orange-700 flex items-center justify-center text-xl">
                🟠
              </div>
              <div>
                <div className="text-sm text-orange-700 font-medium">CR</div>
                <div className="text-2xl font-bold text-orange-800">{stats.cr.total} <span className="text-xs font-normal">进行中</span></div>
                <div className="text-xs text-orange-600">{stats.cr.reviewing} 待审核</div>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-xl border border-red-200 bg-red-50 hover:shadow-md transition-all cursor-pointer" onClick={() => setActiveTab('qr')}>
              <div className="w-12 h-12 rounded-full bg-red-200 text-red-700 flex items-center justify-center text-xl">
                🔴
              </div>
              <div>
                <div className="text-sm text-red-700 font-medium">QR</div>
                <div className="text-2xl font-bold text-red-800">{stats.qr.total} <span className="text-xs font-normal">待处理</span></div>
                <div className="text-xs text-red-600">↑{stats.qr.new} 本周新增</div>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 bg-gray-50 hover:shadow-md transition-all cursor-default">
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
                <TrendingDown size={24} />
              </div>
              <div>
                <div className="text-sm text-gray-600 font-medium">质量 PPM</div>
                <div className="text-2xl font-bold text-gray-800">{stats.ppm}</div>
                <div className="text-xs text-green-600">↓12 环比改善</div>
              </div>
            </div>
          </div>
                    </div>
                    
        <div className="container mx-auto px-10 max-w-[1440px]">
          {/* Tab 导航 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="flex border-b border-gray-100">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative ${
                    activeTab === tab.id ? 'text-lx-gold' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <tab.icon size={18} />
                  {tab.label}
                  {tab.badge && tab.badge > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                      tab.id === 'qr' ? 'bg-red-500 text-white' : 
                      tab.id === 'cr' ? 'bg-orange-500 text-white' : 
                      'bg-yellow-500 text-white'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-lx-gold" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab 内容 */}
            <div className="p-6">
              {/* 质量看板 */}
              {activeTab === 'dashboard' && (
                <div className="space-y-6">
                  {/* 趋势图 */}
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-gray-900">📊 质量趋势 (近6周)</h3>
                      <div className="flex gap-4 text-xs">
                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-500 rounded"></span> Hold</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-500 rounded"></span> CR</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded"></span> QR</span>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="week" axisLine={false} tickLine={false} fontSize={12} />
                        <YAxis axisLine={false} tickLine={false} fontSize={12} />
                        <Tooltip />
                        <Line type="monotone" dataKey="hold" stroke="#eab308" strokeWidth={2} dot={{ fill: '#eab308' }} name="Hold" />
                        <Line type="monotone" dataKey="cr" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316' }} name="CR" />
                        <Line type="monotone" dataKey="qr" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444' }} name="QR" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    {/* 供应商排名 */}
                    <div className="border border-gray-100 rounded-xl p-4">
                      <h3 className="text-sm font-bold text-gray-900 mb-4">🏭 供应商质量排名 (问题数)</h3>
                      <div className="space-y-3">
                        {supplierRanking.map((supplier, idx) => (
                          <div key={supplier.name} className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              idx === 0 ? 'bg-red-100 text-red-700' : 
                              idx === 1 ? 'bg-orange-100 text-orange-700' : 
                              'bg-gray-100 text-gray-600'
                            }`}>{idx + 1}</span>
                            <span className="flex-1 text-sm text-gray-700">{supplier.name}</span>
                            <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${idx === 0 ? 'bg-red-500' : idx === 1 ? 'bg-orange-500' : 'bg-gray-400'}`}
                                style={{ width: `${(supplier.issues / 15) * 100}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium text-gray-900 w-8">{supplier.issues}</span>
                            <span className={`text-xs ${supplier.trend === 'up' ? 'text-red-500' : supplier.trend === 'down' ? 'text-green-500' : 'text-gray-400'}`}>
                              {supplier.trend === 'up' ? '↑' : supplier.trend === 'down' ? '↓' : '→'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 缺陷类型分布 */}
                    <div className="border border-gray-100 rounded-xl p-4">
                      <h3 className="text-sm font-bold text-gray-900 mb-4">📦 缺陷类型分布</h3>
                      <div className="flex items-center">
                        <ResponsiveContainer width="50%" height={160}>
                          <PieChart>
                            <Pie
                              data={defectDistribution}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={60}
                              dataKey="value"
                            >
                              {defectDistribution.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="flex-1 space-y-2">
                          {defectDistribution.map(item => (
                            <div key={item.name} className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded" style={{ backgroundColor: item.color }}></span>
                              <span className="text-sm text-gray-600 flex-1">{item.name}</span>
                              <span className="text-sm font-medium text-gray-900">{item.value}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Hold 管理 */}
              {activeTab === 'hold' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex gap-2">
                      {['all', 'pending', 'analyzing', 'released'].map(filter => (
                        <button
                          key={filter}
                          onClick={() => setHoldFilter(filter)}
                          className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                            holdFilter === filter ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {filter === 'all' ? '全部' : filter === 'pending' ? '待分析' : filter === 'analyzing' ? '分析中' : '已释放'}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button className="flex items-center gap-1 px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600">
                        <Plus size={14} /> 新建Hold
                      </button>
                      <button className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                        <Download size={14} /> 导出
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {holdRecords
                      .filter(h => holdFilter === 'all' || h.status === holdFilter)
                      .map(hold => {
                        const statusStyle = getHoldStatusStyle(hold.status);
                        return (
                          <div 
                            key={hold.id}
                            className={`border rounded-xl p-4 transition-all cursor-pointer ${
                              selectedHold === hold.id ? 'border-yellow-400 ring-2 ring-yellow-100' : 'border-gray-100 hover:border-gray-200'
                            }`}
                            onClick={() => setSelectedHold(selectedHold === hold.id ? null : hold.id)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="text-xl">🟡</span>
                                  <span className="font-mono text-sm text-gray-500">{hold.id}</span>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                                    {statusStyle.label}
                                  </span>
                                </div>
                                <div className="text-sm">
                                  <span className="font-medium text-gray-900">{hold.material}</span>
                                  <span className="text-gray-400 mx-2">|</span>
                                  <span className="text-gray-500">批次: {hold.batch}</span>
                                  <span className="text-gray-400 mx-2">|</span>
                                  <span className="text-gray-500">数量: {hold.quantity}件</span>
                                </div>
                                <div className="text-sm text-gray-500 mt-1">Hold原因: {hold.reason}</div>
                              </div>
                              <ChevronRight size={20} className={`text-gray-400 transition-transform ${selectedHold === hold.id ? 'rotate-90' : ''}`} />
                            </div>

                            {selectedHold === hold.id && (
                              <div className="mt-4 pt-4 border-t border-gray-100">
                                <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                                  <div>
                                    <span className="text-gray-500">存放位置:</span>
                                    <span className="ml-2 text-gray-900">{hold.location}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">负责人:</span>
                                    <span className="ml-2 text-gray-900">{hold.owner}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">创建时间:</span>
                                    <span className="ml-2 text-gray-900">{hold.createdAt}</span>
                                  </div>
                                </div>
                                
                                {/* 状态流转 */}
                                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                                  <div className="text-xs text-gray-500 mb-2">状态流转</div>
                                  <div className="flex items-center gap-2 text-xs">
                                    {['pending', 'analyzing', 'releasing', 'released'].map((s, idx) => (
                                      <React.Fragment key={s}>
                                        <span className={`px-2 py-1 rounded ${
                                          hold.status === s ? 'bg-yellow-500 text-white' : 
                                          ['released', 'scrapped'].includes(hold.status) && idx < 4 ? 'bg-green-100 text-green-700' :
                                          'bg-gray-200 text-gray-500'
                                        }`}>
                                          {s === 'pending' ? '待分析' : s === 'analyzing' ? '分析中' : s === 'releasing' ? '待释放' : '已释放'}
                                        </span>
                                        {idx < 3 && <span className="text-gray-300">→</span>}
                                      </React.Fragment>
                                    ))}
                                  </div>
                                </div>

                                {hold.status !== 'released' && hold.status !== 'scrapped' && (
                                  <div className="flex gap-2">
                                    <button className="px-3 py-1.5 bg-yellow-500 text-white text-sm rounded-lg hover:bg-yellow-600">
                                      {hold.status === 'pending' ? '开始分析' : hold.status === 'analyzing' ? '提交释放' : '审批释放'}
                                    </button>
                                    <button className="px-3 py-1.5 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600">
                                      升级CR
                                    </button>
                                    <button className="px-3 py-1.5 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
                                      报废处理
                                    </button>
                                  </div>
                                )}
                                
                                {hold.releaseConclusion && (
                                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3">
                                    <div className="text-xs text-green-600 mb-1">释放结论</div>
                                    <div className="text-sm text-green-800">{hold.releaseConclusion}</div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                                </div>
                            </div>
                        )}

              {/* CR 审核 */}
              {activeTab === 'cr' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex gap-2">
                      {['all', 'reviewing', '8d_progress', 'closed'].map(filter => (
                        <button
                          key={filter}
                          onClick={() => setCrFilter(filter)}
                          className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                            crFilter === filter ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {filter === 'all' ? '全部' : filter === 'reviewing' ? '待审核' : filter === '8d_progress' ? '8D进行中' : '已关闭'}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600">
                        <Plus size={14} /> 新建CR
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {crRecords
                      .filter(c => crFilter === 'all' || c.status === crFilter)
                      .map(cr => {
                        const statusStyle = getCRStatusStyle(cr.status);
                        const urgencyStyle = getUrgencyStyle(cr.urgency);
                        return (
                          <div 
                            key={cr.id}
                            className={`border rounded-xl p-4 transition-all cursor-pointer ${
                              selectedCR === cr.id ? 'border-orange-400 ring-2 ring-orange-100' : 'border-gray-100 hover:border-gray-200'
                            }`}
                            onClick={() => setSelectedCR(selectedCR === cr.id ? null : cr.id)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="text-xl">🟠</span>
                                  <span className="font-mono text-sm text-gray-500">{cr.id}</span>
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${urgencyStyle.bg} ${urgencyStyle.text}`}>
                                    {urgencyStyle.label}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                                    {statusStyle.label}
                                  </span>
                                </div>
                                <div className="text-sm">
                                  <span className="text-gray-500">供应商:</span>
                                  <span className="font-medium text-gray-900 ml-1">{cr.supplier}</span>
                                  <span className="text-gray-400 mx-2">|</span>
                                  <span className="text-gray-500">物料:</span>
                                  <span className="ml-1">{cr.material}</span>
                                  <span className="text-gray-400 mx-2">|</span>
                                  <span className="text-gray-500">缺陷:</span>
                                  <span className="ml-1">{cr.defectType}</span>
                                </div>
                                <div className="text-sm text-gray-500 mt-1">{cr.description}</div>
                              </div>
                              <ChevronRight size={20} className={`text-gray-400 transition-transform ${selectedCR === cr.id ? 'rotate-90' : ''}`} />
                            </div>

                            {selectedCR === cr.id && (
                              <div className="mt-4 pt-4 border-t border-gray-100">
                                {/* 8D 进度 */}
                                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                                  <div className="text-xs text-gray-500 mb-2">8D 报告进度</div>
                                  <div className="flex items-center gap-1">
                                    {[1,2,3,4,5,6,7,8].map(d => (
                                      <div key={d} className="flex-1 text-center">
                                        <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-xs font-medium ${
                                          d <= cr.d8Progress ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-500'
                                        }`}>
                                          D{d}
                                        </div>
                                        <div className="text-[10px] text-gray-400 mt-1">
                                          {d === 1 ? '团队' : d === 2 ? '问题' : d === 3 ? '临时' : d === 4 ? '根因' : d === 5 ? '永久' : d === 6 ? '验证' : d === 7 ? '预防' : '总结'}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {cr.supplierFeedback && (
                                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                                    <div className="text-xs text-blue-600 mb-1">供应商最新反馈</div>
                                    <div className="text-sm text-blue-800">{cr.supplierFeedback}</div>
                                  </div>
                                )}

                                <div className="flex items-center justify-between">
                                  <div className="text-sm text-gray-500">
                                    响应截止: <span className={cr.urgency === 'high' ? 'text-red-600 font-medium' : ''}>{cr.responseDeadline}</span>
                                  </div>
                                  {cr.status !== 'closed' && (
                                    <div className="flex gap-2">
                                      <button className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 flex items-center gap-1">
                                        <FileText size={14} /> 查看8D报告
                                      </button>
                                      {cr.status === 'reviewing' && (
                                        <>
                                          <button className="px-3 py-1.5 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600">
                                            审核通过
                                          </button>
                                          <button className="px-3 py-1.5 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
                                            退回修改
                                          </button>
                                        </>
                                      )}
                                      <button className="px-3 py-1.5 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600">
                                        升级QR
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                </div>
              )}

              {/* QR 审核 */}
              {activeTab === 'qr' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex gap-2">
                      {['all', 'reviewing', 'processing', 'closed'].map(filter => (
                        <button
                          key={filter}
                          onClick={() => setQrFilter(filter)}
                          className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                            qrFilter === filter ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {filter === 'all' ? '全部' : filter === 'reviewing' ? '待审核' : filter === 'processing' ? '处理中' : '已关闭'}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600">
                        <Plus size={14} /> 新建QR
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {qrRecords
                      .filter(q => qrFilter === 'all' || q.status === qrFilter)
                      .map(qr => {
                        const severityStyle = getSeverityStyle(qr.severity);
                        return (
                          <div 
                            key={qr.id}
                            className={`border rounded-xl p-4 transition-all cursor-pointer ${
                              selectedQR === qr.id ? 'border-red-400 ring-2 ring-red-100' : 'border-gray-100 hover:border-gray-200'
                            }`}
                            onClick={() => setSelectedQR(selectedQR === qr.id ? null : qr.id)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="text-xl">🔴</span>
                                  <span className="font-mono text-sm text-gray-500">{qr.id}</span>
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${severityStyle.bg} ${severityStyle.text}`}>
                                    {severityStyle.label}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                    qr.status === 'closed' ? 'bg-green-100 text-green-700' : 
                                    qr.status === 'reviewing' ? 'bg-purple-100 text-purple-700' : 
                                    'bg-blue-100 text-blue-700'
                                  }`}>
                                    {qr.status === 'closed' ? '已关闭' : qr.status === 'reviewing' ? '待审核' : '处理中'}
                                  </span>
                                </div>
                                <div className="text-sm">
                                  <span className="text-gray-500">供应商:</span>
                                  <span className="font-medium text-gray-900 ml-1">{qr.supplier}</span>
                                  <span className="text-gray-400 mx-2">|</span>
                                  <span className="text-gray-500">物料:</span>
                                  <span className="ml-1">{qr.material}</span>
                                  <span className="text-gray-400 mx-2">|</span>
                                  <span className="text-gray-500">拒收数量:</span>
                                  <span className="ml-1 text-red-600 font-medium">{qr.quantity}件</span>
                                </div>
                                <div className="text-sm text-gray-500 mt-1">{qr.defectDescription}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-lg font-bold text-red-600">¥{qr.lossAmount.toLocaleString()}</div>
                                <div className="text-xs text-gray-400">预估损失</div>
                              </div>
                            </div>

                            {selectedQR === qr.id && (
                              <div className="mt-4 pt-4 border-t border-gray-100">
                                {/* 8D 进度 */}
                                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                                  <div className="text-xs text-gray-500 mb-2">8D 报告进度</div>
                                  <div className="flex items-center gap-1">
                                    {[1,2,3,4,5,6,7,8].map(d => (
                                      <div key={d} className="flex-1 text-center">
                                        <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-xs font-medium ${
                                          d <= qr.d8Progress ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-500'
                                        }`}>
                                          D{d}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* 处理方案 */}
                                <div className="mb-4">
                                  <div className="text-xs text-gray-500 mb-2">处理方案</div>
                                  <div className="flex gap-2">
                                    {['return', 'claim', 'replace', 'downgrade'].map(r => (
                                      <label key={r} className="flex items-center gap-1 cursor-pointer">
                                        <input 
                                          type="radio" 
                                          name={`resolution-${qr.id}`} 
                                          checked={qr.resolution === r}
                                          className="text-red-500"
                                          readOnly
                                        />
                                        <span className="text-sm text-gray-700">
                                          {r === 'return' ? '退货' : r === 'claim' ? '索赔' : r === 'replace' ? '换货' : '降级使用'}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </div>

                                {qr.status !== 'closed' && (
                                  <div className="flex gap-2">
                                    <button className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 flex items-center gap-1">
                                      <FileText size={14} /> 查看8D报告
                                    </button>
                                    {qr.status === 'reviewing' && (
                                      <>
                                        <button className="px-3 py-1.5 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600">
                                          审核通过
                                        </button>
                                        <button className="px-3 py-1.5 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
                                          退回修改
                                        </button>
                                      </>
                                    )}
                                    <button className="px-3 py-1.5 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600">
                                      索赔申请
                                    </button>
                                  </div>
                                )}

                                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                                  ⚠️ 供应商考核影响: 该QR将影响"{qr.supplier}"的供应商等级评分 (-{qr.severity === 'critical' ? 15 : qr.severity === 'major' ? 10 : 5}分)
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
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
              <h3 className="font-semibold text-white text-sm">质量分析助手</h3>
              <p className="text-xs text-gray-400">Hold / CR / QR AI 副驾驶</p>
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
            <button className="text-xs text-gray-500 hover:text-gray-700" onClick={() => setTasks(prev => prev.map(t => ({ ...t, read: true })))}>全部已读</button>
          </div>
          
          <div className="max-h-[200px] overflow-y-auto">
            {tasks.slice(0, 4).map(task => {
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
                          {action.action.includes('view') ? <Eye size={12} /> : <ExternalLink size={12} />}
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
                placeholder="输入问题，如：本周质量情况？"
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
            <div className="flex gap-2 mt-2 flex-wrap">
              <button 
                onClick={() => setInputValue('本周质量情况？')}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors"
              >
                本周质量
              </button>
              <button 
                onClick={() => setInputValue('有哪些超期单据？')}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors"
              >
                超期单据
              </button>
              <button 
                onClick={() => setInputValue('供应商质量排名？')}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors"
              >
                供应商排名
              </button>
              <button 
                onClick={() => setInputValue('Hold状态汇总')}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors"
              >
                Hold汇总
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
