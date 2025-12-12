/**
 * 运动规划引擎
 * 根据DeviceMotionMessage生成精确的运动时间线
 */

import { RhythmFrame } from '@/lib/rhythm/mockGenerator';
import { ConfigMessage, SessionMessage, ControlMessage, Unit, Primitive, Movement } from '@/lib/protobuf/types';

// 运动时间线关键帧
export interface TimelineKeyframe {
  timestamp: number; // 相对时间（毫秒，从运动开始计算）
  frame: RhythmFrame;
}

// 运动状态
export enum MotionState {
  IDLE = 'idle',      // 空闲
  RUNNING = 'running', // 运行中
  PAUSED = 'paused',   // 暂停
}

// 运动日志
export interface MotionLog {
  timestamp: number;
  message: string;
}

// Primitive缓存
type PrimitivesCache = Map<string, Primitive>;

/**
 * 运动规划器类
 */
export class MotionPlanner {
  private primitivesCache: PrimitivesCache = new Map();
  private currentTimeline: TimelineKeyframe[] = [];
  private currentState: MotionState = MotionState.IDLE;
  private globalIntensity: number = 1.0; // 全局强度倍率（由SET_INTENSITY设置）
  private logs: MotionLog[] = [];
  private maxLogs: number = 10;

  /**
   * 保存primitive配置
   */
  savePrimitives(config: ConfigMessage): void {
    if (!config.primitives || config.primitives.length === 0) {
      this.addLog('ConfigMessage: 无primitives配置');
      return;
    }

    this.primitivesCache.clear();
    config.primitives.forEach(primitive => {
      if (primitive.primitiveId) {
        this.primitivesCache.set(primitive.primitiveId, primitive);
      }
    });

    this.addLog(`ConfigMessage: 已保存${config.primitives.length}个primitive配置`);
  }

  /**
   * 根据SessionMessage生成运动时间线
   */
  generateTimeline(session: SessionMessage, startTime: number = 0): TimelineKeyframe[] {
    console.log('[MotionPlanner] generateTimeline 开始');
    console.log('[MotionPlanner] session:', session);
    console.log('[MotionPlanner] primitivesCache size:', this.primitivesCache.size);
    console.log('[MotionPlanner] primitivesCache keys:', Array.from(this.primitivesCache.keys()));
    
    if (!session.units || session.units.length === 0) {
      console.warn('[MotionPlanner] 无units，无法生成时间线');
      this.addLog('SessionMessage: 无units，无法生成时间线');
      return [];
    }

    console.log('[MotionPlanner] units 数量:', session.units.length);

    const timeline: TimelineKeyframe[] = [];
    let currentTime = startTime;
    let currentStroke = 0.5; // 初始位置（中间）
    let currentRotation = 0;
    let validUnitsCount = 0;

    // 遍历所有units
    for (const unit of session.units) {
      console.log('[MotionPlanner] 处理 unit:', {
        primitiveId: unit.primitiveId,
        iteration: unit.iteration,
        intensity: unit.intensity
      });
      
      const primitive = this.primitivesCache.get(unit.primitiveId);
      
      if (!primitive) {
        console.warn(`[MotionPlanner] 找不到primitiveId=${unit.primitiveId}`);
        this.addLog(`SessionMessage: 跳过unit，找不到primitiveId=${unit.primitiveId}`);
        continue; // 跳过找不到的primitive
      }

      console.log('[MotionPlanner] 找到primitive:', {
        primitiveId: primitive.primitiveId,
        movements_count: primitive.movements?.length || 0
      });

      validUnitsCount++;
      const unitIntensity = (unit.intensity || 1.0) * this.globalIntensity;
      const iteration = unit.iteration || 1;
      console.log('[MotionPlanner] unitIntensity:', unitIntensity, 'iteration:', iteration);

      // 重复执行iteration次
      for (let iter = 0; iter < iteration; iter++) {
        // 遍历primitive中的所有movements
        for (const movement of primitive.movements || []) {
          const movementDuration = (movement.duration || 0) * 1000; // 转换为毫秒
          const movementStartTime = currentTime;
          const endTime = currentTime + movementDuration;

          // 计算目标值（应用intensity倍率）
          // 忽略direction，因为垂直方向是往复运动
          const targetStroke = Math.max(0, Math.min(1, (movement.distance || 0) * unitIntensity));
          
          // rotation: 应用intensity和方向
          // rotationDirection: 0=逆时针(负值), 1=顺时针(正值)
          const baseRotation = (movement.rotation || 0) * unitIntensity;
          const targetRotation = movement.rotationDirection === 0 
            ? -baseRotation  // 逆时针，使用负值
            : baseRotation;  // 顺时针，使用正值

          console.log('[MotionPlanner] 生成关键帧:', {
            iter,
            movement: {
              distance: movement.distance,
              duration: movement.duration,
              rotation: movement.rotation,
              rotationDirection: movement.rotationDirection
            },
            movementStartTime,
            endTime,
            currentStroke,
            targetStroke,
            currentRotation,
            targetRotation
          });

          // 生成开始关键帧
          timeline.push({
            timestamp: movementStartTime,
            frame: {
              t: movementStartTime,
              stroke: currentStroke,
              rotation: currentRotation,
              intensity: unitIntensity,
              suck: 0.5, // 默认值
              mode: `session_${unit.primitiveId}_iter${iter}`
            }
          });

          // 生成结束关键帧
          timeline.push({
            timestamp: endTime,
            frame: {
              t: endTime,
              stroke: targetStroke,
              rotation: targetRotation,
              intensity: unitIntensity,
              suck: 0.5, // 默认值
              mode: `session_${unit.primitiveId}_iter${iter}`
            }
          });

          // 更新当前值和时间
          currentStroke = targetStroke;
          currentRotation = targetRotation;
          currentTime = endTime;
        }
      }
    }

    if (validUnitsCount > 0) {
      const totalDuration = currentTime - startTime;
      console.log('[MotionPlanner] 时间线生成完成:', {
        validUnitsCount,
        totalDuration,
        keyframeCount: timeline.length
      });
      this.addLog(`SessionMessage: 开始执行Session，包含${validUnitsCount}个units，总时长${totalDuration}ms`);
    } else {
      console.warn('[MotionPlanner] 所有units都找不到对应的primitive，无法生成时间线');
      this.addLog('SessionMessage: 所有units都找不到对应的primitive，无法生成时间线');
    }

    return timeline;
  }

  /**
   * 处理控制指令
   */
  handleControl(control: ControlMessage): { 
    action: 'reset' | 'pause' | 'resume' | 'set_intensity' | 'none';
    timeline?: TimelineKeyframe[];
    intensity?: number;
  } {
    switch (control.command) {
      case 1: // COMMAND_RESET
        this.currentTimeline = [];
        this.currentState = MotionState.IDLE;
        this.addLog('ControlMessage(RESET): 已重置运动，清空时间线');
        return {
          action: 'reset',
          timeline: [{
            timestamp: 0,
            frame: {
              t: Date.now(),
              stroke: 0, // 重置到最上端
              rotation: 0,
              intensity: 0.5,
              suck: 0.5,
              mode: 'reset'
            }
          }]
        };

      case 2: // COMMAND_PAUSE
        this.currentState = MotionState.PAUSED;
        this.addLog('ControlMessage(PAUSE): 已暂停运动');
        return { action: 'pause' };

      case 3: // COMMAND_RESUME
        this.currentState = MotionState.RUNNING;
        this.addLog('ControlMessage(RESUME): 已恢复运动');
        return { action: 'resume' };

      case 4: // COMMAND_SET_INTENSITY
        const intensity = control.intensity || 1.0;
        this.globalIntensity = Math.max(0, Math.min(2, intensity)); // 限制在0-2之间
        this.addLog(`ControlMessage(SET_INTENSITY): 设置全局强度倍率为${this.globalIntensity}`);
        return { action: 'set_intensity', intensity: this.globalIntensity };

      default:
        return { action: 'none' };
    }
  }

  /**
   * 根据时间戳获取当前应该显示的RhythmFrame（支持线性插值）
   */
  getFrameAtTime(timeline: TimelineKeyframe[], currentTime: number, startTime: number): RhythmFrame | null {
    if (!timeline || timeline.length === 0) {
      return null;
    }

    const relativeTime = currentTime - startTime;

    // 如果时间早于第一个关键帧，返回第一个关键帧
    if (relativeTime <= timeline[0].timestamp) {
      return timeline[0].frame;
    }

    // 如果时间晚于最后一个关键帧，返回最后一个关键帧
    if (relativeTime >= timeline[timeline.length - 1].timestamp) {
      return timeline[timeline.length - 1].frame;
    }

    // 找到当前时间所在的两个关键帧之间
    for (let i = 0; i < timeline.length - 1; i++) {
      const frame1 = timeline[i];
      const frame2 = timeline[i + 1];

      if (relativeTime >= frame1.timestamp && relativeTime <= frame2.timestamp) {
        // 线性插值
        const t1 = frame1.timestamp;
        const t2 = frame2.timestamp;
        const ratio = (relativeTime - t1) / (t2 - t1);

        const f1 = frame1.frame;
        const f2 = frame2.frame;

        return {
          t: currentTime,
          stroke: f1.stroke + (f2.stroke - f1.stroke) * ratio,
          rotation: f1.rotation + (f2.rotation - f1.rotation) * ratio,
          intensity: f1.intensity + (f2.intensity - f1.intensity) * ratio,
          suck: f1.suck + (f2.suck - f1.suck) * ratio,
          mode: f2.mode || f1.mode
        };
      }
    }

    return timeline[timeline.length - 1].frame;
  }

  /**
   * 添加日志
   */
  private addLog(message: string): void {
    this.logs.unshift({
      timestamp: Date.now(),
      message
    });
    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }
  }

  /**
   * 获取日志
   */
  getLogs(): MotionLog[] {
    return [...this.logs];
  }

  /**
   * 清空日志
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * 获取primitives缓存
   */
  getPrimitivesCache(): PrimitivesCache {
    return this.primitivesCache;
  }
}

