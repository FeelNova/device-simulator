'use client';

/**
 * Suction 时间轴图表组件
 * 协议字段仍为 rotation, GUI 中按 0..1 强度显示.
 */

import TimelineChart from './TimelineChart';

interface RotationTimelineChartProps {
  data: Array<{ timestamp: number; value: number }>;
  active?: boolean;
}

export default function RotationTimelineChart({ data, active = false }: RotationTimelineChartProps) {
  const strengthData = data.map(item => ({
    timestamp: item.timestamp,
    value: Math.max(0, Math.min(1, item.value))
  }));

  return (
    <div className="w-full h-full">
      <TimelineChart
        data={strengthData}
        label="Suction"
        minValue={0}
        maxValue={1}
        color="#34d399"
        timeWindow={10000}
        active={active}
      />
    </div>
  );
}
