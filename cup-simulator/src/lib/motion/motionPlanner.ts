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
  strokeSpeed?: number; // 当前 movement 的 stroke 速度
  unitIndex?: number; // 当前 unit 的索引
  primitiveId?: string; // 当前 primitive 的 ID
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

interface RuntimeSegmentPlan {
  offset: number;
  duration: number;
  strokeSpeed: number;
  suctionLevel: number;
  strokeDistanceBefore: number;
  modePrefix: 'session' | 'interval';
}

interface RuntimeUnitPlan {
  unitIndex: number;
  primitiveId: string;
  iteration: number;
  intensity: number;
  offset: number;
  duration: number;
  iterationDuration: number;
  strokeDistanceBefore: number;
  strokeDistancePerIteration: number;
  segments: RuntimeSegmentPlan[];
}

interface RuntimeTimelinePlan {
  startTime: number;
  totalDuration: number;
  initialStroke: number;
  initialStrokeDirection: 1 | -1;
  units: RuntimeUnitPlan[];
}

interface KeyframeResult {
  frame: RhythmFrame;
  strokeSpeed?: number;
  unitIndex?: number;
  primitiveId?: string;
}

/**
 * 运动规划器类
 */
export class MotionPlanner {
  private primitivesCache: PrimitivesCache = new Map();
  private currentTimeline: TimelineKeyframe[] = [];
  private runtimePlan: RuntimeTimelinePlan | null = null;
  private currentState: MotionState = MotionState.IDLE;
  private globalIntensity: number = 1.0; // 全局强度倍率（由SET_INTENSITY设置）
  private controlInterval: number = 2000; // 控制间隔（毫秒），默认 2 秒
  private logs: MotionLog[] = [];
  private maxLogs: number = 10;
  
  // 当前 unit 强度管理
  private currentUnitIntensity: number = 1.0; // 当前 unit 的动态强度（可被 SET_INTENSITY 修改）
  private currentUnitIndex: number | null = null; // 当前执行的 unit 索引
  private originalUnitIntensities: Map<number, number> = new Map(); // 保存每个 unit 的原始 intensity

  private clampStroke(stroke: number): number {
    if (!Number.isFinite(stroke)) {
      return 0.5;
    }

    return Math.max(0, Math.min(1, stroke));
  }

  private advanceStroke(startStroke: number, direction: 1 | -1, distance: number): { stroke: number; direction: 1 | -1 } {
    const stroke = this.clampStroke(startStroke);
    const currentDirection: 1 | -1 = direction >= 0 ? 1 : -1;
    const remaining = Math.max(0, distance);

    if (remaining === 0) {
      return { stroke, direction: currentDirection };
    }

    const phase = currentDirection > 0 ? stroke + remaining : 2 - stroke + remaining;
    const normalizedPhase = ((phase % 2) + 2) % 2;
    const nextStroke = normalizedPhase <= 1 ? normalizedPhase : 2 - normalizedPhase;
    const nextDirection: 1 | -1 = normalizedPhase < 1 ? 1 : -1;

    return {
      stroke: this.clampStroke(nextStroke),
      direction: nextDirection
    };
  }

  private createRuntimeKeyframe(plan: RuntimeTimelinePlan, relativeTime: number): KeyframeResult | null {
    if (plan.units.length === 0) {
      return null;
    }

    const clampedRelativeTime = Math.max(0, Math.min(relativeTime, plan.totalDuration));
    let selectedUnit = plan.units[plan.units.length - 1];

    for (const unit of plan.units) {
      if (clampedRelativeTime >= unit.offset && clampedRelativeTime <= unit.offset + unit.duration) {
        selectedUnit = unit;
        break;
      }
    }

    const unitElapsed = Math.max(0, Math.min(clampedRelativeTime - selectedUnit.offset, selectedUnit.duration));
    const safeIterationDuration = Math.max(selectedUnit.iterationDuration, 1);
    const iterationIndex = Math.min(
      selectedUnit.iteration - 1,
      Math.floor(unitElapsed / safeIterationDuration)
    );
    const iterationElapsed = Math.min(
      unitElapsed - iterationIndex * safeIterationDuration,
      selectedUnit.iterationDuration
    );

    let selectedSegment = selectedUnit.segments[selectedUnit.segments.length - 1];
    for (const segment of selectedUnit.segments) {
      if (iterationElapsed >= segment.offset && iterationElapsed <= segment.offset + segment.duration) {
        selectedSegment = segment;
        break;
      }
    }

    const segmentElapsed = Math.max(
      0,
      Math.min(iterationElapsed - selectedSegment.offset, selectedSegment.duration)
    );
    const strokeDistance =
      selectedUnit.strokeDistanceBefore +
      iterationIndex * selectedUnit.strokeDistancePerIteration +
      selectedSegment.strokeDistanceBefore +
      selectedSegment.strokeSpeed * (segmentElapsed / 1000);
    const stroke = this.advanceStroke(
      plan.initialStroke,
      plan.initialStrokeDirection,
      strokeDistance
    ).stroke;
    const suctionLevel = selectedSegment.suctionLevel;

    return {
      frame: {
        t: clampedRelativeTime,
        stroke,
        rotation: suctionLevel,
        intensity: selectedUnit.intensity,
        suck: 0.5,
        mode: `${selectedSegment.modePrefix}_${selectedUnit.primitiveId}_iter${iterationIndex}`
      },
      strokeSpeed: selectedSegment.strokeSpeed,
      unitIndex: selectedUnit.unitIndex,
      primitiveId: selectedUnit.primitiveId
    };
  }

  private createRuntimeSentinelTimeline(plan: RuntimeTimelinePlan): TimelineKeyframe[] {
    const firstKeyframe = this.createRuntimeKeyframe(plan, 0);
    const lastKeyframe = this.createRuntimeKeyframe(plan, plan.totalDuration);

    if (!firstKeyframe || !lastKeyframe) {
      return [];
    }

    return [
      {
        timestamp: 0,
        ...firstKeyframe
      },
      {
        timestamp: plan.totalDuration,
        ...lastKeyframe
      }
    ];
  }

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
    
    // 重置当前 unit 信息
    this.currentUnitIndex = null;
    this.currentUnitIntensity = 1.0;
    this.originalUnitIntensities.clear();
    this.runtimePlan = null;
    
    if (!session.units || session.units.length === 0) {
      console.warn('[MotionPlanner] 无units，无法生成时间线');
      this.addLog('SessionMessage: 无units，无法生成时间线');
      return [];
    }

    console.log('[MotionPlanner] units 数量:', session.units.length);

    let currentTime = startTime;
    let cumulativeStrokeDistance = 0;
    let validUnitsCount = 0;
    const units: RuntimeUnitPlan[] = [];

    // 遍历所有units
    for (let unitIndex = 0; unitIndex < session.units.length; unitIndex++) {
      const unit = session.units[unitIndex];
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
      
      // 保存原始 intensity
      const originalIntensity = unit.intensity || 1.0;
      this.originalUnitIntensities.set(unitIndex, originalIntensity);
      
      // 如果是第一个 unit，初始化当前 unit 信息
      if (this.currentUnitIndex === null) {
        this.currentUnitIntensity = originalIntensity;
        this.currentUnitIndex = unitIndex;
      }
      
      // 使用原始 intensity 计算（动态强度会在生成帧时应用）
      const unitIntensity = originalIntensity * this.globalIntensity;
      const iteration = Math.max(1, Math.floor(Number(unit.iteration) || 1));
      console.log('[MotionPlanner] unitIntensity:', unitIntensity, 'iteration:', iteration, 'originalIntensity:', originalIntensity);
      
      // 注意：不在生成timeline时添加日志，而是在执行时检测unit切换后添加

      const movements = primitive.movements || [];
      const segments: RuntimeSegmentPlan[] = [];
      let iterationDuration = 0;
      let iterationStrokeDistance = 0;

      for (let movementIndex = 0; movementIndex < movements.length; movementIndex++) {
        const movement = movements[movementIndex];
        const movementDuration = Math.max(0, (movement.duration || 0) * 1000);
        const strokeSpeed = (movement.distance || 0) * unitIntensity / (movement.duration || 1);
        const suctionLevel = Math.max(0, Math.min(1, Math.abs(Number(movement.rotation) || 0) * unitIntensity));

        if (movementDuration > 0) {
          segments.push({
            offset: iterationDuration,
            duration: movementDuration,
            strokeSpeed,
            suctionLevel,
            strokeDistanceBefore: iterationStrokeDistance,
            modePrefix: 'session'
          });

          iterationDuration += movementDuration;
          iterationStrokeDistance += strokeSpeed * (movementDuration / 1000);
        }

      }

      if (segments.length === 0 || iterationDuration <= 0) {
        console.warn(`[MotionPlanner] primitiveId=${unit.primitiveId} 没有可执行movement`);
        this.addLog(`SessionMessage: 跳过unit，primitiveId=${unit.primitiveId} 没有可执行movement`);
        continue;
      }

      const unitDuration = iterationDuration * iteration;
      units.push({
        unitIndex,
        primitiveId: unit.primitiveId,
        iteration,
        intensity: unitIntensity,
        offset: currentTime - startTime,
        duration: unitDuration,
        iterationDuration,
        strokeDistanceBefore: cumulativeStrokeDistance,
        strokeDistancePerIteration: iterationStrokeDistance,
        segments
      });

      currentTime += unitDuration;
      cumulativeStrokeDistance += iterationStrokeDistance * iteration;
    }

    if (validUnitsCount > 0 && units.length > 0) {
      const totalDuration = currentTime - startTime;
      this.runtimePlan = {
        startTime,
        totalDuration,
        initialStroke: 0.5,
        initialStrokeDirection: 1,
        units
      };
      const timeline = this.createRuntimeSentinelTimeline(this.runtimePlan);

      console.log('[MotionPlanner] 时间线生成完成:', {
        validUnitsCount,
        totalDuration,
        keyframeCount: timeline.length,
        runtimeUnits: units.length
      });
      this.addLog(`SessionMessage: 开始执行Session，包含${validUnitsCount}个units，总时长${totalDuration}ms`);
      return timeline;
    }

    console.warn('[MotionPlanner] 所有units都找不到对应的primitive，无法生成时间线');
    this.addLog('SessionMessage: 所有units都找不到对应的primitive，无法生成时间线');
    return [];
  }

  /**
   * 处理控制指令
   */
  handleControl(control: ControlMessage): { 
    action: 'reset' | 'pause' | 'resume' | 'set_intensity' | 'none';
    timeline?: TimelineKeyframe[];
    intensity?: number;
  } {
    console.log('[MotionPlanner] handleControl 收到的 control.command:', control.command, '类型:', typeof control.command);
    switch (control.command) {
      case 1: // COMMAND_RESET
        this.currentTimeline = [];
        this.runtimePlan = null;
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
        const messageIntensity = control.intensity || 1.0;
        
        // 如果当前有 unit 在执行，修改当前 unit 的 intensity
        if (this.currentUnitIndex !== null) {
          const originalIntensity = this.originalUnitIntensities.get(this.currentUnitIndex) || 1.0;
          // 新 intensity = 消息中的 intensity × 当前 unit 的原始 intensity
          this.currentUnitIntensity = messageIntensity * originalIntensity;
          this.addLog(`ControlMessage(SET_INTENSITY): 修改当前 Unit[${this.currentUnitIndex}] 的强度为 ${this.currentUnitIntensity} (原始: ${originalIntensity}, 消息: ${messageIntensity})`);
        } else {
          // 没有 unit 在执行，设置全局强度作为后备
          this.globalIntensity = Math.max(0, Math.min(2, messageIntensity));
          this.addLog(`ControlMessage(SET_INTENSITY): 没有 unit 在执行，设置全局强度为 ${this.globalIntensity}`);
        }
        return { action: 'set_intensity', intensity: this.currentUnitIntensity };

      default:
        return { action: 'none' };
    }
  }

  /**
   * 根据时间戳获取当前应该显示的RhythmFrame（支持线性插值）
   */
  getFrameAtTime(timeline: TimelineKeyframe[], currentTime: number, startTime: number): RhythmFrame | null {
    const result = this.getKeyframeAtTime(timeline, currentTime, startTime);
    return result?.frame || null;
  }

  /**
   * 根据时间戳获取当前应该显示的Keyframe（包含strokeSpeed信息）
   */
  getKeyframeAtTime(timeline: TimelineKeyframe[], currentTime: number, startTime: number): { frame: RhythmFrame; strokeSpeed?: number; unitIndex?: number; primitiveId?: string } | null {
    if (!timeline || timeline.length === 0) {
      return null;
    }

    const relativeTime = currentTime - startTime;

    if (this.runtimePlan) {
      return this.createRuntimeKeyframe(this.runtimePlan, relativeTime);
    }

    // 如果时间早于第一个关键帧，返回第一个关键帧
    if (relativeTime <= timeline[0].timestamp) {
      return {
        frame: timeline[0].frame,
        strokeSpeed: timeline[0].strokeSpeed,
        unitIndex: timeline[0].unitIndex,
        primitiveId: timeline[0].primitiveId
      };
    }

    // 如果时间晚于最后一个关键帧，返回最后一个关键帧
    if (relativeTime >= timeline[timeline.length - 1].timestamp) {
      const lastKeyframe = timeline[timeline.length - 1];
      return {
        frame: lastKeyframe.frame,
        strokeSpeed: lastKeyframe.strokeSpeed,
        unitIndex: lastKeyframe.unitIndex,
        primitiveId: lastKeyframe.primitiveId
      };
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

        // strokeSpeed 使用 frame2 的值（更接近当前时间）
        return {
          frame: {
            t: currentTime,
            stroke: f1.stroke + (f2.stroke - f1.stroke) * ratio,
            rotation: f1.rotation + (f2.rotation - f1.rotation) * ratio,
            intensity: f1.intensity + (f2.intensity - f1.intensity) * ratio,
            suck: f1.suck + (f2.suck - f1.suck) * ratio,
            mode: f2.mode || f1.mode
          },
          strokeSpeed: frame2.strokeSpeed ?? frame1.strokeSpeed,
          unitIndex: frame2.unitIndex ?? frame1.unitIndex,
          primitiveId: frame2.primitiveId ?? frame1.primitiveId
        };
      }
    }

    const lastKeyframe = timeline[timeline.length - 1];
    return {
      frame: lastKeyframe.frame,
      strokeSpeed: lastKeyframe.strokeSpeed,
      unitIndex: lastKeyframe.unitIndex,
      primitiveId: lastKeyframe.primitiveId
    };
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
   * 公共方法：添加日志（供外部调用）
   */
  addLogMessage(message: string): void {
    this.addLog(message);
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

  /**
   * 更新当前执行的 unit
   */
  updateCurrentUnit(unitIndex: number, unitIntensity: number): void {
    // 如果切换到新的 unit，重置强度为原始值
    if (this.currentUnitIndex !== unitIndex) {
      const originalIntensity = this.originalUnitIntensities.get(unitIndex) || unitIntensity;
      this.currentUnitIntensity = originalIntensity;
    }
    // 如果还是同一个 unit，保持当前强度（可能已被 SET_INTENSITY 修改）
    this.currentUnitIndex = unitIndex;
  }

  /**
   * 获取当前 unit 的动态强度
   */
  getCurrentUnitIntensity(): number {
    return this.currentUnitIntensity;
  }

  /**
   * 获取当前 unit 的索引
   */
  getCurrentUnitIndex(): number | null {
    return this.currentUnitIndex;
  }

  /**
   * 设置控制间隔
   */
  setControlInterval(interval: number): void {
    this.controlInterval = Math.max(0, interval);
  }

  /**
   * 获取控制间隔
   */
  getControlInterval(): number {
    return this.controlInterval;
  }
}
