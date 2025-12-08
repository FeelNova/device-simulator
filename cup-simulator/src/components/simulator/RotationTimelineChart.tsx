'use client';

/**
 * Rotation 时间轴图表组件
 */

import TimelineChart from './TimelineChart';

interface RotationTimelineChartProps {
  data: Array<{ timestamp: number; value: number }>;
}

export default function RotationTimelineChart({ data }: RotationTimelineChartProps) {
  return (
    <div className="w-full h-full">
      <TimelineChart
        data={data}
        label="Rotation"
        minValue={-1}
        maxValue={1}
        color="#d4a574"
        timeWindow={10000}
      />
    </div>
  );
}

