'use client';

/**
 * Stroke 时间轴图表组件
 */

import TimelineChart from './TimelineChart';

interface StrokeTimelineChartProps {
  data: Array<{ timestamp: number; value: number }>;
  active?: boolean;
}

export default function StrokeTimelineChart({ data, active = false }: StrokeTimelineChartProps) {
  return (
    <div className="w-full h-full">
      <TimelineChart
        data={data}
        label="Stroke Speed"
        minValue={0}
        maxValue={10}
        color="#4a8ab8"
        timeWindow={10000}
        active={active}
      />
    </div>
  );
}
