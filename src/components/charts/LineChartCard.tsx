"use client";

import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Info } from 'lucide-react';

interface DataPoint {
  name: string;
  [key: string]: string | number;
}

interface LineChartCardProps {
  title: string;
  data: DataPoint[];
  lines: { dataKey: string; color: string; name?: string }[];
  className?: string;
  onInfoClick?: () => void;
  infoText?: string;
  height?: number;
}

export default function LineChartCard({ 
  title, 
  data, 
  lines, 
  className = "",
  onInfoClick,
  infoText,
  height = 300
}: LineChartCardProps) {
  return (
    <div className={`bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-6 shadow-lg shadow-black/10 flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          {title}
          {onInfoClick && infoText && (
            <button
              onClick={onInfoClick}
              className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-[#1e293b] transition-all cursor-pointer"
              title={infoText}
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          )}
        </h3>
      </div>
      <div className="flex-1 w-full" style={{ minHeight: `${height}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.15)" />
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#64748b', fontSize: 12 }} 
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#64748b', fontSize: 12 }} 
            />
            <Tooltip
              contentStyle={{ 
                background: '#0d1527', 
                border: '1px solid #1e293b', 
                borderRadius: '8px', 
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                color: '#fff',
                fontSize: '12px'
              }}
              labelStyle={{ color: '#fff' }}
              itemStyle={{ color: '#94a3b8' }}
            />
            <Legend 
              iconType="circle"
              wrapperStyle={{ 
                fontSize: '12px', 
                color: '#94a3b8',
                paddingTop: '16px'
              }}
            />
            {lines.map((line, index) => (
              <Line
                key={index}
                type="monotone"
                dataKey={line.dataKey}
                stroke={line.color}
                name={line.name || line.dataKey}
                strokeWidth={3}
                dot={{ fill: line.color, r: 4, strokeWidth: 2 }}
                activeDot={{ r: 6, fill: line.color }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
