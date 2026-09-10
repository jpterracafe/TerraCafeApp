"use client";

import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Info } from 'lucide-react';

interface DataPoint {
  name: string;
  value: number;
}

interface PieChartCardProps {
  title: string;
  data: DataPoint[];
  colors: string[];
  className?: string;
  onInfoClick?: () => void;
  infoText?: string;
}

export default function PieChartCard({ 
  title, 
  data, 
  colors, 
  className = "",
  onInfoClick,
  infoText
}: PieChartCardProps) {
  return (
    <div className={`bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-6 shadow-lg shadow-black/10 flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          {title}
          {onInfoClick && infoText && (
            <button
              onClick={onInfoClick}
              className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-[#1e293b] transition-all cursor-pointer"
              title="O que significa este gráfico?"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          )}
        </h3>
      </div>
      <div className="flex-1 w-full" style={{ minHeight: '300px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ 
                background: '#0d1527', 
                border: '1px solid #1e293b', 
                borderRadius: '8px', 
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                color: '#fff',
                fontSize: '12px'
              }}
              formatter={(value, name) => [`${Number(value)} ${title.includes('Status') ? 'ações' : 'processos'}`, String(name)]}
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
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
