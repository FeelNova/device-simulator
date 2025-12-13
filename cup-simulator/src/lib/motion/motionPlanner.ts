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

/**
 * 运动规划器类
 */
export class MotionPlanner {
  private primitivesCache: PrimitivesCache = new Map();
  private currentTimeline: TimelineKeyframe[] = [];
  private currentState: MotionState = MotionState.IDLE;
  private globalIntensity: number = 1.0; // 全局强度倍率（由SET_INTENSITY设置）
  private controlInterval: number = 2000; // 控制间隔（毫秒），默认 2 秒
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
   * 在间隔期间生成关键帧，保持旋转累积和 stroke 往复运动
   */
  private generateIntervalKeyframes(
    startTime: number,
    intervalDuration: number,
    rotationSpeed: number,
    currentRotation: number,
    strokeSpeed: number,
    currentStroke: number,
    unitIntensity: number,
    unitPrimitiveId: string,
    unitIndex: number,
    iter: number,
    context: string
  ): TimelineKeyframe[] {
    const keyframes: TimelineKeyframe[] = [];
    const keyframeInterval = 50; // 毫秒
    const numKeyframes = Math.max(2, Math.ceil(intervalDuration / keyframeInterval));
    
    for (let i = 0; i <= numKeyframes; i++) {
      const relativeTime = (i / numKeyframes) * intervalDuration;
      const timestamp = startTime + relativeTime;
      
      // 旋转继续累积
      const rotationDelta = rotationSpeed * (relativeTime / 1000); // 转换为秒
      const rotationPosition = currentRotation + rotationDelta;
      
      // stroke 继续往复运动（使用与 movement 期间相同的逻辑）
      let strokePosition: number;
      if (strokeSpeed <= 0) {
        strokePosition = currentStroke; // 如果速度为0，保持在当前位置
      } else {
        // 计算在间隔期间完成的往复次数
        const cycles = strokeSpeed * (intervalDuration / 1000); // 转换为秒
        const cycleProgress = (relativeTime / intervalDuration) * cycles;
        // 从当前位置继续，需要计算当前 stroke 位置对应的相位偏移
        // 如果 currentStroke 在上升阶段（0-0.5），相位偏移为 currentStroke/2
        // 如果 currentStroke 在下降阶段（0.5-1），相位偏移为 1 - (1-currentStroke)/2
        let phaseOffset = 0;
        if (currentStroke < 0.5) {
          phaseOffset = currentStroke / 2; // 上升阶段
        } else {
          phaseOffset = 1 - (1 - currentStroke) / 2; // 下降阶段
        }
        const cyclePhase = (cycleProgress + phaseOffset) % 1;
        
        // 锯齿波：每个周期从0到1再到0
        if (cyclePhase < 0.5) {
          strokePosition = cyclePhase * 2;
        } else {
          strokePosition = 2 - (cyclePhase * 2);
        }
        strokePosition = Math.max(0, Math.min(1, strokePosition));
      }
      
      keyframes.push({
        timestamp,
        frame: {
          t: timestamp,
          stroke: strokePosition,  // 修改：继续往复运动，而不是0
          rotation: rotationPosition,
          intensity: unitIntensity,
          suck: 0.5,
          mode: `interval_${unitPrimitiveId}_iter${iter}_${context}`
        },
        strokeSpeed: strokeSpeed, // 存储间隔期间的 stroke 速度
        unitIndex: unitIndex, // 存储当前 unit 的索引
        primitiveId: unitPrimitiveId // 存储当前 primitive 的 ID
      });
    }
    
    return keyframes;
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
      const unitIntensity = (unit.intensity || 1.0) * this.globalIntensity;
      const iteration = unit.iteration || 1;
      console.log('[MotionPlanner] unitIntensity:', unitIntensity, 'iteration:', iteration);
      
      // 注意：不在生成timeline时添加日志，而是在执行时检测unit切换后添加

      // 保存最后一个 movement 的旋转速度和 stroke 速度，用于间隔期间
      let lastRotationSpeed = 0;
      let lastStrokeSpeed = 0;

      // 重复执行iteration次
      for (let iter = 0; iter < iteration; iter++) {
        // 遍历primitive中的所有movements
        const movements = primitive.movements || [];
        for (let movementIndex = 0; movementIndex < movements.length; movementIndex++) {
          const movement = movements[movementIndex];
          const movementDuration = (movement.duration || 0) * 1000; // 转换为毫秒
          const movementStartTime = currentTime;
          const endTime = currentTime + movementDuration;

          // 计算速度（应用intensity倍率）
          // 根据 motion_desc.md: distance / duration = 垂直运动速度（完整行程/秒）
          // strokeSpeed 表示每秒完成的完整往复次数
          const strokeSpeed = (movement.distance || 0) * unitIntensity / (movement.duration || 1);
          
          // rotation 已经是旋转速度（圈数/秒），不需要除以 duration
          // rotationDirection: 0=逆时针(负值), 1=顺时针(正值)
          const baseRotationSpeed = (movement.rotation || 0) * unitIntensity;
          const rotationSpeed = movement.rotationDirection === 0 
            ? -baseRotationSpeed  // 逆时针，使用负值
            : baseRotationSpeed;  // 顺时针，使用正值

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
            strokeSpeed,
            rotationSpeed,
            currentStroke,
            currentRotation
          });

          // 计算在duration时间内完成的往复次数
          const cycles = strokeSpeed * (movement.duration || 0);
          
          // 生成往复运动的关键帧序列
          // 使用锯齿波实现全行程（0-1）的往复运动
          // 关键帧间隔：每50ms一个关键帧，确保平滑
          const keyframeInterval = 50; // 毫秒
          const numKeyframes = Math.max(2, Math.ceil(movementDuration / keyframeInterval));
          
          for (let i = 0; i <= numKeyframes; i++) {
            const relativeTime = (i / numKeyframes) * movementDuration;
            const timestamp = movementStartTime + relativeTime;
            
            // 计算往复运动的位置（0-1）
            // 使用锯齿波实现全行程（0-1）的往复运动
            // 每个movement都从0开始，实现全行程往复
            let strokePosition: number;
            if (cycles <= 0 || strokeSpeed <= 0) {
              // 如果速度为0，保持在0位置（全行程往复的起始位置）
              strokePosition = 0;
            } else {
              // 计算当前在哪个往复周期中
              const cycleProgress = (relativeTime / movementDuration) * cycles;
              const cyclePhase = cycleProgress % 1; // 0-1之间的相位
              
              // 锯齿波：每个周期从0到1再到0
              if (cyclePhase < 0.5) {
                // 上升阶段：0 -> 1
                strokePosition = cyclePhase * 2;
              } else {
                // 下降阶段：1 -> 0
                strokePosition = 2 - (cyclePhase * 2);
              }
              
              // 确保在0-1范围内
              strokePosition = Math.max(0, Math.min(1, strokePosition));
            }
            
            // 计算累积旋转（旋转是累积的，不是往复的）
            const rotationDelta = rotationSpeed * (relativeTime / 1000); // 转换为秒
            const rotationPosition = currentRotation + rotationDelta;
            
            timeline.push({
              timestamp,
              frame: {
                t: timestamp,
                stroke: strokePosition,
                rotation: rotationPosition,
                intensity: unitIntensity,
                suck: 0.5, // 默认值
                mode: `session_${unit.primitiveId}_iter${iter}`
              },
              strokeSpeed: strokeSpeed, // 存储当前 movement 的 stroke 速度
              unitIndex: unitIndex, // 存储当前 unit 的索引
              primitiveId: unit.primitiveId // 存储当前 primitive 的 ID
            });
          }

          // 更新当前值和时间
          // 注意：每个movement都从0开始全行程往复，所以currentStroke在movement结束时重置为0
          // 但为了保持连续性，我们计算结束时的位置（虽然下一个movement会从0开始）
          const finalCycleProgress = cycles % 1;
          if (cycles > 0 && strokeSpeed > 0) {
            if (finalCycleProgress < 0.5) {
              currentStroke = finalCycleProgress * 2;
            } else {
              currentStroke = 2 - (finalCycleProgress * 2);
            }
            currentStroke = Math.max(0, Math.min(1, currentStroke));
          } else {
            // 如果速度为0，保持在0位置
            currentStroke = 0;
          }
          // 旋转是累积的
          currentRotation = currentRotation + rotationSpeed * (movement.duration || 0);
          // 保存最后一个 movement 的旋转速度和 stroke 速度
          lastRotationSpeed = rotationSpeed;
          lastStrokeSpeed = strokeSpeed;
          currentTime = endTime;
          
          // 在 movement 之间添加 control_interval（除了最后一个 movement）
          if (movementIndex < movements.length - 1) {
            // 生成间隔期间的关键帧，保持旋转累积和 stroke 往复运动
            const intervalKeyframes = this.generateIntervalKeyframes(
              currentTime,
              this.controlInterval,
              rotationSpeed, // 使用当前 movement 的旋转速度
              currentRotation,
              strokeSpeed, // 使用当前 movement 的 stroke 速度
              currentStroke, // 使用当前 stroke 位置
              unitIntensity,
              unit.primitiveId,
              unitIndex, // 传入当前 unit 的索引
              iter,
              `movement${movementIndex}`
            );
            timeline.push(...intervalKeyframes);
            
            // 更新旋转值和 stroke 位置（在间隔期间继续累积/往复）
            currentRotation = currentRotation + rotationSpeed * (this.controlInterval / 1000);
            // 更新 stroke 位置：计算间隔结束时的位置
            if (strokeSpeed > 0) {
              const intervalCycles = strokeSpeed * (this.controlInterval / 1000);
              const intervalCycleProgress = intervalCycles % 1;
              let phaseOffset = 0;
              if (currentStroke < 0.5) {
                phaseOffset = currentStroke / 2;
              } else {
                phaseOffset = 1 - (1 - currentStroke) / 2;
              }
              const finalCyclePhase = (intervalCycleProgress + phaseOffset) % 1;
              if (finalCyclePhase < 0.5) {
                currentStroke = finalCyclePhase * 2;
              } else {
                currentStroke = 2 - (finalCyclePhase * 2);
              }
              currentStroke = Math.max(0, Math.min(1, currentStroke));
            }
            currentTime += this.controlInterval;
          }
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

