/**
 * 数据标准化工具
 * 确保从 protobuf 或 WebSocket 接收的数据符合预期格式
 */

import { RhythmFrame } from './mockGenerator';

/**
 * 标准化节奏帧数据
 * 确保所有值都在预期范围内
 */
export function normalizeFrame(data: any): RhythmFrame {
  return {
    t: typeof data.t === 'number' ? data.t : Date.now(),
    stroke: Math.max(0, Math.min(1, Number(data.stroke) || 0)),
    rotation: Math.max(-1, Math.min(1, Number(data.rotation) || 0)),
    intensity: Math.max(0, Math.min(1, Number(data.intensity) || 0)),
    suck: Math.max(0, Math.min(1, Number(data.suck) ?? 0.5)), // 默认0.5（2档）
    mode: typeof data.mode === 'string' ? data.mode : 'unknown'
  };
}

