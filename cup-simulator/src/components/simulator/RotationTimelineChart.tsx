'use client';

/**
 * Rotation 时间轴图表组件
 * 将 rotation 值从 -1 到 1 映射到 0 到 1 显示
 */

import TimelineChart from './TimelineChart';

interface RotationTimelineChartProps {
  data: Array<{ timestamp: number; value: number }>;
}

export default function RotationTimelineChart({ data }: RotationTimelineChartProps) {
  // 将 rotation 值从 -1 到 1 映射到 0 到 1
  const normalizedData = data.map(item => ({
    timestamp: item.timestamp,
    value: (item.value + 1) / 2 // 从 [-1, 1] 映射到 [0, 1]
  }));

  return (
    <div className="w-full h-full">
      <TimelineChart
        data={normalizedData}
        label="Rotation"
        minValue={0}
        maxValue={1}
        color="#d4a574"
        timeWindow={10000}
      />
    </div>
  );
}

