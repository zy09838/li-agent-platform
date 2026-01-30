import React from 'react';

// 中国地图 SVG 路径数据（简化版真实地图轮廓）
export const ChinaMapSVG: React.FC<{
  className?: string;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
}> = ({ 
  className = '', 
  fillColor = '#2a2a2a', 
  strokeColor = '#cfa972',
  strokeWidth = 0.5
}) => {
  return (
    <svg 
      viewBox="73 15 67 55" 
      className={className}
      style={{ filter: 'drop-shadow(0 0 10px rgba(207, 169, 114, 0.15))' }}
    >
      <defs>
        <linearGradient id="chinaMapGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2d2d2d" />
          <stop offset="50%" stopColor="#252525" />
          <stop offset="100%" stopColor="#1f1f1f" />
        </linearGradient>
      </defs>
      
      {/* 中国大陆主体 */}
      <path
        d="M122.5,28.5 L124.5,26.5 L127,27 L129,25.5 L131,26 L133,24.5 L135,25.5 L134,28 L132,29.5 
           L133,31 L131.5,33 L133,35 L131,37 L129,36 L127,37.5 L125,36.5 L123,38 L121,37 L119,38.5 
           L117,37.5 L115,39 L113,38 L111,39.5 L109,38.5 L107,40 L105,39 L103,40.5 L101,39.5 L99,41 
           L97,40 L95,41.5 L93,40.5 L91,42 L89,41 L87,42.5 L85,41.5 L83,43 L81,42 L79,43.5 L77,42.5 
           L75.5,44 L74,43 L73.5,45 L75,47 L77,48.5 L79,48 L81,49.5 L83,49 L85,50.5 L87,50 L89,51.5 
           L91,51 L93,52.5 L95,52 L97,53.5 L99,53 L101,54.5 L103,54 L105,55.5 L107,55 L109,56.5 
           L111,56 L113,57.5 L115,57 L117,58.5 L119,58 L121,59.5 L123,59 L125,60.5 L126,62 L124,63.5 
           L122,63 L120,64.5 L118,64 L116,65.5 L114,65 L112,66.5 L110,66 L108,67.5 L106,67 L104,68 
           L102,67 L100,68 L98,67 L96,67.5 L94,66.5 L92,67 L90,66 L88,66.5 L86,65.5 L84,66 L82,65 
           L80,65.5 L78,64.5 L76,65 L74.5,64 L73,62 L74,60 L76,59 L78,58 L80,57 L82,56.5 L84,55.5 
           L86,55 L88,54 L90,53.5 L92,53 L94,52 L96,51.5 L98,51 L100,50 L102,49.5 L104,49 L106,48 
           L108,47.5 L110,47 L112,46 L114,45.5 L116,45 L118,44 L120,43 L122,42 L124,41 L126,40 
           L128,39 L130,38 L132,36.5 L134,35 L135.5,33 L136,31 L135,29 L133,28 L131,27.5 L129,28 
           L127,29 L125,29.5 L123,29 Z"
        fill="url(#chinaMapGradient)"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        opacity="0.9"
      />
      
      {/* 黑龙江 */}
      <path
        d="M119,18 L122,17 L125,18 L128,17.5 L131,19 L134,18.5 L136,20 L137,22 L135.5,24 L133,25 
           L130,24.5 L127,25 L124,24 L121,25 L118,24 L116,22 L117,20 Z"
        fill="url(#chinaMapGradient)"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        opacity="0.85"
      />
      
      {/* 新疆 */}
      <path
        d="M73.5,24 L76,22 L80,21 L84,22 L88,21 L92,22.5 L96,22 L99,24 L97,27 L94,29 L91,28 
           L88,30 L85,29 L82,31 L79,30 L76,32 L74,31 L73,28 Z"
        fill="url(#chinaMapGradient)"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        opacity="0.85"
      />
      
      {/* 西藏 */}
      <path
        d="M73.5,36 L77,34 L81,35 L85,34 L89,35.5 L93,35 L96,37 L93,40 L89,41 L85,40.5 L81,42 
           L77,41 L74,43 L73,40 Z"
        fill="url(#chinaMapGradient)"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        opacity="0.85"
      />
      
      {/* 内蒙古 */}
      <path
        d="M99,22 L103,21 L107,22 L111,21 L115,22.5 L118,24 L121,25 L118,28 L115,27 L112,29 
           L109,28 L106,30 L103,29 L100,31 L97,30 L95,28 L97,25 Z"
        fill="url(#chinaMapGradient)"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        opacity="0.85"
      />
      
      {/* 台湾 */}
      <path
        d="M122,54 L123.5,52 L124,55 L123,58 L121,59 L120,57 Z"
        fill="url(#chinaMapGradient)"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        opacity="0.85"
      />
      
      {/* 海南 */}
      <path
        d="M108,64 L110,62.5 L112,64 L111,66.5 L108.5,67 L107,65.5 Z"
        fill="url(#chinaMapGradient)"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        opacity="0.85"
      />
      
      {/* 省份分界线 - 更真实的内部边界 */}
      <g stroke="#3a3a3a" strokeWidth="0.3" fill="none" opacity="0.6">
        {/* 东北地区 */}
        <path d="M123,28 Q125,32 127,35" />
        <path d="M127,25 L125,30" />
        
        {/* 华北地区 */}
        <path d="M112,30 Q115,35 118,38" />
        <path d="M115,32 L118,35" />
        
        {/* 华东地区 */}
        <path d="M118,45 Q120,50 122,55" />
        <path d="M115,48 L120,52" />
        
        {/* 华中地区 */}
        <path d="M105,42 Q108,48 112,52" />
        <path d="M108,45 Q110,50 113,54" />
        
        {/* 华南地区 */}
        <path d="M105,55 Q108,60 112,63" />
        <path d="M100,58 L108,62" />
        
        {/* 西南地区 */}
        <path d="M90,45 Q95,52 100,58" />
        <path d="M85,50 Q92,55 98,60" />
        
        {/* 西北地区 */}
        <path d="M80,30 Q88,35 95,38" />
        <path d="M85,28 L92,34" />
      </g>
      
      {/* 主要河流 */}
      <g stroke="#4a6670" strokeWidth="0.4" fill="none" opacity="0.4">
        {/* 长江 */}
        <path d="M85,48 Q95,50 105,52 Q112,53 118,55" strokeDasharray="2 1" />
        {/* 黄河 */}
        <path d="M90,35 Q100,38 108,42 Q112,44 115,46" strokeDasharray="2 1" />
      </g>
      
      {/* 南海诸岛示意 */}
      <g fill={fillColor} stroke={strokeColor} strokeWidth="0.2" opacity="0.5">
        <circle cx="112" cy="68" r="0.5" />
        <circle cx="114" cy="69" r="0.4" />
        <circle cx="116" cy="68.5" r="0.3" />
        <circle cx="115" cy="70" r="0.4" />
      </g>
    </svg>
  );
};

export default ChinaMapSVG;

