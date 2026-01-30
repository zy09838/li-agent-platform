import React, { useEffect, useState, useMemo } from 'react';

interface GeoFeature {
  type: string;
  properties: {
    name: string;
    adcode: number;
    center: [number, number];
  };
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
}

interface GeoJSON {
  type: string;
  features: GeoFeature[];
}

// 供应链节点类型
export interface MapNode {
  id: string;
  name: string;
  lon: number;  // 经度
  lat: number;  // 纬度
  type: 'hq' | 'port' | 'supplier' | 'factory' | 'logistics' | 'warehouse' | 'rd';
  status: 'normal' | 'warning' | 'high';
}

interface ChinaMapRealProps {
  className?: string;
  width?: number;
  height?: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  highlightProvinces?: string[];
  nodes?: MapNode[];
  selectedNodeId?: string | null;
  onNodeClick?: (nodeId: string) => void;
  onProvinceClick?: (name: string) => void;
}

export const ChinaMapReal: React.FC<ChinaMapRealProps> = ({
  className = '',
  width = 800,
  height = 600,
  strokeColor = '#cfa972',
  strokeWidth = 0.5,
  highlightProvinces = [],
  nodes = [],
  selectedNodeId,
  onNodeClick,
  onProvinceClick
}) => {
  const [geoData, setGeoData] = useState<GeoJSON | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredProvince, setHoveredProvince] = useState<string | null>(null);

  useEffect(() => {
    fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load map data');
        return res.json();
      })
      .then(data => {
        setGeoData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading map:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // 计算边界和投影
  const { paths, projectCoord, bounds } = useMemo(() => {
    if (!geoData) return { paths: [], projectCoord: null, bounds: null };

    // 中国地图的经纬度边界（包含一些边距）
    const mapBounds = {
      minLon: 73,
      maxLon: 136,
      minLat: 16,
      maxLat: 55
    };

    // 投影函数：将经纬度转换为 SVG 坐标
    const project = (lon: number, lat: number): [number, number] => {
      const x = ((lon - mapBounds.minLon) / (mapBounds.maxLon - mapBounds.minLon)) * width;
      const y = height - ((lat - mapBounds.minLat) / (mapBounds.maxLat - mapBounds.minLat)) * height;
      return [x, y];
    };

    // 将坐标数组转换为 SVG path
    const coordsToPath = (coords: number[][]): string => {
      if (coords.length === 0) return '';
      const points = coords.map(([lon, lat]) => project(lon, lat));
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
      return d + ' Z';
    };

    // 生成所有省份的 paths
    const paths = geoData.features.map(feature => {
      let d = '';
      
      if (feature.geometry.type === 'Polygon') {
        (feature.geometry.coordinates as number[][][]).forEach(ring => {
          d += coordsToPath(ring) + ' ';
        });
      } else if (feature.geometry.type === 'MultiPolygon') {
        (feature.geometry.coordinates as number[][][][]).forEach(polygon => {
          polygon.forEach(ring => {
            d += coordsToPath(ring) + ' ';
          });
        });
      }

      return {
        name: feature.properties.name,
        adcode: feature.properties.adcode,
        center: feature.properties.center,
        d: d.trim()
      };
    });

    return { paths, projectCoord: project, bounds: mapBounds };
  }, [geoData, width, height]);

  // 获取节点样式
  const getNodeStyle = (node: MapNode, isSelected: boolean) => {
    const isHQ = node.type === 'hq';
    const isHigh = node.status === 'high';
    const isWarning = node.status === 'warning';
    
    let size = isHQ ? 8 : isHigh ? 6 : isWarning ? 5 : 4;
    let fill = isHQ ? '#cfa972' : isHigh ? '#d9534f' : isWarning ? '#f0ad4e' : '#4caf50';
    let stroke = isHQ ? '#fff' : 'none';
    let strokeW = isHQ ? 2 : 0;
    
    if (isSelected) {
      size *= 1.5;
    }
    
    return { size, fill, stroke, strokeW };
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-gray-400 flex items-center gap-2">
          <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          <span>加载地图数据...</span>
        </div>
      </div>
    );
  }

  if (error || !projectCoord) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-red-400">地图加载失败</div>
      </div>
    );
  }

  return (
    <svg 
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      style={{ filter: 'drop-shadow(0 0 15px rgba(207, 169, 114, 0.1))' }}
    >
      <defs>
        <linearGradient id="chinaMapGradientReal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2d2d2d" />
          <stop offset="50%" stopColor="#252525" />
          <stop offset="100%" stopColor="#1f1f1f" />
        </linearGradient>
        <filter id="nodeGlow">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* 渲染所有省份 */}
      {paths.map((province, idx) => {
        const isHighlighted = highlightProvinces.includes(province.name);
        const isHovered = hoveredProvince === province.name;
        
        return (
          <path
            key={province.adcode || idx}
            d={province.d}
            fill={isHighlighted ? '#3d3520' : isHovered ? '#333' : 'url(#chinaMapGradientReal)'}
            stroke={isHighlighted ? '#cfa972' : strokeColor}
            strokeWidth={isHighlighted ? strokeWidth * 1.5 : strokeWidth}
            opacity={isHighlighted ? 1 : 0.9}
            className="transition-all duration-200 cursor-pointer"
            onMouseEnter={() => setHoveredProvince(province.name)}
            onMouseLeave={() => setHoveredProvince(null)}
            onClick={() => onProvinceClick?.(province.name)}
          >
            <title>{province.name}</title>
          </path>
        );
      })}
      
      {/* 渲染供应链节点 */}
      {nodes.map(node => {
        const [x, y] = projectCoord(node.lon, node.lat);
        const isSelected = selectedNodeId === node.id;
        const isHigh = node.status === 'high';
        const isHQ = node.type === 'hq';
        const style = getNodeStyle(node, isSelected);
        
        return (
          <g 
            key={node.id} 
            className="cursor-pointer"
            onClick={() => onNodeClick?.(node.id)}
          >
            {/* 光晕效果 - 仅高风险显示静态光晕 */}
            {isHigh && (
              <circle
                cx={x}
                cy={y}
                r={style.size + 6}
                fill={style.fill}
                opacity={0.25}
              />
            )}
            
            {/* 节点主体 */}
            <circle
              cx={x}
              cy={y}
              r={style.size}
              fill={style.fill}
              stroke={isSelected ? '#fff' : style.stroke}
              strokeWidth={isSelected ? 2 : style.strokeW}
              className="transition-all duration-200"
            />
            
            {/* 节点标签 - 仅选中或总部显示 */}
            {(isSelected || isHQ) && (
              <g>
                <rect
                  x={x - node.name.length * 5}
                  y={y + style.size + 4}
                  width={node.name.length * 10 + 8}
                  height={18}
                  rx={4}
                  fill={isHQ ? '#cfa972' : isHigh ? 'rgba(217, 83, 79, 0.9)' : node.status === 'warning' ? 'rgba(240, 173, 78, 0.9)' : 'rgba(42, 42, 42, 0.9)'}
                />
                <text
                  x={x + 4}
                  y={y + style.size + 16}
                  fontSize={10}
                  fontWeight={500}
                  fill={isHQ || node.status === 'warning' ? '#000' : '#fff'}
                  textAnchor="middle"
                >
                  {node.name}
                </text>
              </g>
            )}
          </g>
        );
      })}
      
      {/* 南海诸岛标识框 - 右下角小地图 */}
      <g transform={`translate(${width * 0.82}, ${height * 0.75})`}>
        <rect 
          x="0" y="0" 
          width={width * 0.15} 
          height={height * 0.2} 
          fill="rgba(45, 45, 45, 0.8)" 
          stroke="#666" 
          strokeWidth="0.5" 
          strokeDasharray="3 2"
          rx="3"
        />
        {/* 简化的南海诸岛示意 */}
        <circle cx={width * 0.075} cy={height * 0.06} r="2" fill="#555" />
        <circle cx={width * 0.05} cy={height * 0.09} r="1.5" fill="#555" />
        <circle cx={width * 0.09} cy={height * 0.1} r="1.5" fill="#555" />
        <circle cx={width * 0.06} cy={height * 0.13} r="1" fill="#555" />
        <circle cx={width * 0.1} cy={height * 0.14} r="1" fill="#555" />
        <text 
          x={width * 0.075} 
          y={height * 0.18} 
          textAnchor="middle" 
          fill="#888" 
          fontSize="9"
        >
          南海诸岛
        </text>
      </g>
    </svg>
  );
};

export default ChinaMapReal;
