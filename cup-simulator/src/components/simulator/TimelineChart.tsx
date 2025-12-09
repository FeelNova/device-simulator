'use client';

/**
 * 通用时间轴图表组件
 * 显示实时数据的时间变化曲线（像心率监测一样）
 */

import { useEffect, useRef } from 'react';

interface DataPoint {
  timestamp: number; // 相对时间（毫秒）
  value: number;
}

interface TimelineChartProps {
  data: DataPoint[];
  label: string;
  minValue: number;
  maxValue: number;
  color: string;
  timeWindow: number; // 时间窗口（毫秒），默认10秒
}

export default function TimelineChart({
  data,
  label,
  minValue,
  maxValue,
  color,
  timeWindow = 10000
}: TimelineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // 将 data 存储在 ref 中，避免频繁触发 effect
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // 获取容器的逻辑尺寸（不是物理像素尺寸）
      const rect = container.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      
      if (width === 0 || height === 0) return;
      
      // 使用 ref 获取最新数据，避免闭包问题
      const currentData = dataRef.current;
      // 使用固定的绝对尺寸 padding，不依赖容器大小
      // 进一步减小 padding 以确保所有内容都能显示
      const paddingLeft = 18;   // 左侧 padding（用于 Y 轴标签）
      const paddingRight = 3;   // 右侧 padding
      const paddingTop = 12;    // 顶部 padding（用于标题）
      const paddingBottom = 15; // 底部 padding（用于 X 轴标签）

      // 清空画布
      ctx.clearRect(0, 0, width, height);

      // 绘制背景
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, width, height);

      // 绘制网格线
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;

      // 水平网格线（Y轴）- 减少网格线数量以适应小容器
      const gridLines = 5; // 保持5条线，显示6个刻度（0.0, 0.2, 0.4, 0.6, 0.8, 1.0）
      const drawHeight = height - paddingTop - paddingBottom;
      for (let i = 0; i <= gridLines; i++) {
        const y = paddingTop + drawHeight * (i / gridLines);
        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(width - paddingRight, y);
        ctx.stroke();
      }

      // 垂直网格线（X轴 - 时间）- 减少网格线数量
      const timeGridLines = 5; // 从10减少到5，显示6条线
      const drawWidth = width - paddingLeft - paddingRight;
      for (let i = 0; i <= timeGridLines; i++) {
        const x = paddingLeft + drawWidth * (i / timeGridLines);
        ctx.beginPath();
        ctx.moveTo(x, paddingTop);
        ctx.lineTo(x, height - paddingBottom);
        ctx.stroke();
      }

      if (currentData.length === 0) {
        // 没有数据时显示提示
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data', width / 2, height / 2);
        return;
      }

      // 获取当前时间窗口内的数据
      const now = Date.now();
      const windowStart = now - timeWindow;
      const visibleData = currentData.filter(point => point.timestamp >= windowStart);

      if (visibleData.length === 0) return;

      // 绘制坐标轴标签
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      
      // Y轴标签 - 从最大值到最小值，确保所有刻度都显示
      ctx.textAlign = 'right';
      ctx.font = '8px sans-serif';
      for (let i = 0; i <= gridLines; i++) {
        // i=0 时显示 maxValue，i=gridLines 时显示 minValue
        const value = minValue + (maxValue - minValue) * (1 - i / gridLines);
        const y = paddingTop + drawHeight * (i / gridLines);
        // 确保值在范围内
        const clampedValue = Math.max(minValue, Math.min(maxValue, value));
        // 使用固定的绝对位置，确保在画布范围内
        const labelX = Math.max(1, paddingLeft - 2);
        // 确保标签Y位置在画布范围内
        let labelY = y + 1.5;
        if (i === 0) {
          labelY = Math.max(6, y + 1.5); // 顶部标签
        } else if (i === gridLines) {
          labelY = Math.min(height - 1, y + 1.5); // 底部标签
        }
        
        ctx.fillText(clampedValue.toFixed(1), labelX, labelY);
      }

      // X轴标签（时间）
      ctx.textAlign = 'center';
      ctx.font = '8px sans-serif';
      for (let i = 0; i <= timeGridLines; i++) {
        const timeOffset = (timeWindow / timeGridLines) * i;
        const x = paddingLeft + drawWidth * (i / timeGridLines);
        const seconds = (timeOffset / 1000).toFixed(1);
        // 使用固定的绝对位置，确保在画布范围内
        const labelY = Math.min(height - 1, height - paddingBottom + 10);
        ctx.fillText(`${seconds}s`, x, labelY);
      }

      // 绘制折线
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      visibleData.forEach((point, index) => {
        // 计算X位置（时间位置）
        const timeOffset = now - point.timestamp;
        const x = width - paddingRight - (timeOffset / timeWindow) * drawWidth;

        // 计算Y位置（数值位置）
        // 确保值在范围内，然后归一化
        const clampedValue = Math.max(minValue, Math.min(maxValue, point.value));
        const normalizedValue = (clampedValue - minValue) / (maxValue - minValue);
        // Y 轴从下到上：normalizedValue=0 (minValue) 在底部，normalizedValue=1 (maxValue) 在顶部
        const y = height - paddingBottom - normalizedValue * drawHeight;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // 绘制数据点
      ctx.fillStyle = color;
      visibleData.forEach((point) => {
        const timeOffset = now - point.timestamp;
        const x = width - paddingRight - (timeOffset / timeWindow) * drawWidth;
        // 确保值在范围内，然后归一化
        const clampedValue = Math.max(minValue, Math.min(maxValue, point.value));
        const normalizedValue = (clampedValue - minValue) / (maxValue - minValue);
        // Y 轴从下到上：normalizedValue=0 (minValue) 在底部，normalizedValue=1 (maxValue) 在顶部
        const y = height - paddingBottom - normalizedValue * drawHeight;

        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      // 绘制标签（如果空间足够）- 使用固定的绝对位置
      if (height > 50) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'left';
        // 确保标签在画布范围内
        const labelY = Math.max(8, paddingTop - 2);
        ctx.fillText(label, paddingLeft, labelY);
      }
    };

    // 设置画布尺寸
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      // 确保高度不会无限增长，使用容器的实际高度
      const containerWidth = rect.width;
      const containerHeight = rect.height;
      
      if (containerWidth > 0 && containerHeight > 0) {
        const newWidth = Math.floor(containerWidth * dpr);
        const newHeight = Math.floor(containerHeight * dpr);
        
        // 只在尺寸真正变化时更新
        if (canvasSizeRef.current.width !== newWidth || canvasSizeRef.current.height !== newHeight) {
          canvas.width = newWidth;
          canvas.height = newHeight;
          canvasSizeRef.current = { width: newWidth, height: newHeight };
          
          // 重置 transform 并重新 scale
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.scale(dpr, dpr);
        }
      }
    };

    // 初始调整尺寸
    resizeCanvas();

    // 使用 ResizeObserver 监听容器尺寸变化
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(container);

    // 动画循环
    const animate = () => {
      draw();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    // 监听窗口大小变化（作为备用）
    window.addEventListener('resize', resizeCanvas);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', resizeCanvas);
    };
    // 移除 data 依赖，使用 ref 来获取最新数据
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minValue, maxValue, color, timeWindow, label]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-full rounded-lg overflow-visible" 
      style={{ position: 'relative', height: '100%', width: '100%' }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
}

