/**
 * 模拟器状态管理 Hook
 * 整合 WebSocket 和 mock 数据源
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { mockRhythm, RhythmFrame } from '@/lib/rhythm/mockGenerator';
import { MotionPlanner, TimelineKeyframe, MotionState, MotionLog } from '@/lib/motion/motionPlanner';
import { DeviceMotionMessage } from '@/lib/protobuf/types';

interface UseSimulatorOptions {
  useWebSocket?: boolean;
  wsUrl?: string;
}

export function useSimulator(options: UseSimulatorOptions = {}) {
  const { useWebSocket: enableWS = false, wsUrl } = options;

  const [isRunning, setIsRunning] = useState(false);
  const [currentFrame, setCurrentFrame] = useState<RhythmFrame | null>(null);
  const [strokeHistory, setStrokeHistory] = useState<Array<{ timestamp: number; value: number }>>([]);
  const [rotationHistory, setRotationHistory] = useState<Array<{ timestamp: number; value: number }>>([]);
  const [strokeVelocity, setStrokeVelocity] = useState<number>(0);
  const [rotationVelocity, setRotationVelocity] = useState<number>(0);
  const [currentStrokeSpeed, setCurrentStrokeSpeed] = useState<number>(0); // 当前 keyframe 的 strokeSpeed
  const [controlInterval, setControlInterval] = useState<number>(2000); // 默认 2 秒（毫秒）
  const [isMotionCommandMode, setIsMotionCommandMode] = useState<boolean>(false);

  // 运动规划相关状态
  const motionPlannerRef = useRef<MotionPlanner>(new MotionPlanner());
  const [motionTimeline, setMotionTimeline] = useState<TimelineKeyframe[]>([]);
  const [motionState, setMotionState] = useState<MotionState>(MotionState.IDLE);
  const [commandQueue, setCommandQueue] = useState<DeviceMotionMessage[]>([]);
  const [motionLogs, setMotionLogs] = useState<MotionLog[]>([]);
  const pausedAtTimeRef = useRef<number | null>(null);
  const timelineStartTimeRef = useRef<number | null>(null);
  const processMotionCommandRef = useRef<((command: DeviceMotionMessage) => void) | null>(null);
  const currentUnitIndexRef = useRef<number | null>(null); // 跟踪当前执行的 unit 索引
  const currentSessionRef = useRef<{ units: Array<{ primitiveId?: string; iteration?: number; intensity?: number }> } | null>(null); // 保存当前 session 信息

  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const previousFrameRef = useRef<RhythmFrame | null>(null);
  const previousTimestampRef = useRef<number | null>(null);

  // WebSocket 连接
  const {
    isConnected: isWSConnected,
    lastFrame: wsFrame,
    connect: connectWS,
    disconnect: disconnectWS
  } = useWebSocket({
    url: enableWS && wsUrl ? wsUrl : undefined,
    enabled: enableWS && isRunning,
    onMessage: (frame) => {
      setCurrentFrame(frame);
      // 记录历史数据 - 限制数组长度，避免内存泄漏
      const now = Date.now();
      
      // 计算速度（变化率）
      if (previousFrameRef.current !== null && previousTimestampRef.current !== null) {
        const timeDelta = (now - previousTimestampRef.current) / 1000; // 转换为秒
        if (timeDelta > 0) {
          const strokeDelta = frame.stroke - previousFrameRef.current.stroke;
          const rotationDelta = frame.rotation - previousFrameRef.current.rotation;
          setStrokeVelocity(strokeDelta / timeDelta);
          setRotationVelocity(rotationDelta / timeDelta);
        }
      }
      
      previousFrameRef.current = frame;
      previousTimestampRef.current = now;
      
      setStrokeHistory(prev => {
        const newHistory = [...prev, { timestamp: now, value: frame.stroke }];
        // 限制最大长度为1000，超过则只保留最新的
        return newHistory.length > 1000 ? newHistory.slice(-1000) : newHistory;
      });
      setRotationHistory(prev => {
        const newHistory = [...prev, { timestamp: now, value: frame.rotation }];
        return newHistory.length > 1000 ? newHistory.slice(-1000) : newHistory;
      });
    },
    onError: (error) => {
      console.error('WebSocket error in simulator:', error);
    }
  });

  // 执行队列中的下一个指令
  const executeNextCommand = useCallback(() => {
    setCommandQueue(prev => {
      if (prev.length === 0) {
        // 队列为空，停止运动
        setMotionTimeline([]);
        setMotionState(MotionState.IDLE);
        return [];
      }
      
      const nextCommand = prev[0];
      const remaining = prev.slice(1);
      
      // 处理指令
      setTimeout(() => {
        if (processMotionCommandRef.current) {
          processMotionCommandRef.current(nextCommand);
        }
      }, 0);
      
      return remaining;
    });
  }, []);

  // 基于时间线的运动生成循环
  const generateTimelineFrame = useCallback(() => {
    if (!isRunning || motionState === MotionState.PAUSED) {
      return;
    }

    const now = Date.now();
    
    // 如果有时间线，使用时间线生成帧
    if (motionTimeline.length > 0 && timelineStartTimeRef.current !== null) {
      const relativeTime = now - timelineStartTimeRef.current;
      const keyframeResult = motionPlannerRef.current.getKeyframeAtTime(
        motionTimeline,
        now,
        timelineStartTimeRef.current
      );
      
      if (keyframeResult) {
        const frame = keyframeResult.frame;
        const strokeSpeed = keyframeResult.strokeSpeed ?? strokeVelocity;
        
        // 检测 unit 切换（包括第一个 unit）
        // 注意：unitIndex 可能是 0，所以需要检查 !== null 和 !== undefined
        const newUnitIndex = keyframeResult.unitIndex;
        if (newUnitIndex !== undefined && newUnitIndex !== null && newUnitIndex !== currentUnitIndexRef.current) {
          currentUnitIndexRef.current = newUnitIndex;
          
          // 更新 MotionPlanner 中的当前 unit
          if (currentSessionRef.current && currentSessionRef.current.units[newUnitIndex]) {
            const unit = currentSessionRef.current.units[newUnitIndex];
            motionPlannerRef.current.updateCurrentUnit(newUnitIndex, unit.intensity || 1.0);
            
            const logMessage = `Executing Unit[${newUnitIndex}]: {"primitive_id": "${unit.primitiveId}", "iteration": ${unit.iteration || 1}, "intensity": ${unit.intensity || 1.0}}`;
            motionPlannerRef.current.addLogMessage(logMessage);
            // 立即更新日志，确保UI能显示
            const updatedLogs = motionPlannerRef.current.getLogs();
            setMotionLogs(updatedLogs);
            console.log('[Motion] Unit切换检测:', {
              newUnitIndex,
              primitiveId: unit.primitiveId,
              iteration: unit.iteration,
              intensity: unit.intensity,
              logMessage
            });
          } else {
            console.warn('[Motion] 无法找到unit信息:', {
              newUnitIndex,
              sessionUnits: currentSessionRef.current?.units,
              keyframeResult
            });
          }
        }
        
        // 动态应用强度修改（如果当前 unit 的强度被 SET_INTENSITY 修改）
        let adjustedFrame = frame;
        let adjustedStrokeSpeed = keyframeResult.strokeSpeed ?? strokeVelocity;
        
        if (keyframeResult.unitIndex !== undefined && keyframeResult.unitIndex !== null && currentSessionRef.current) {
          const currentUnit = currentSessionRef.current.units[keyframeResult.unitIndex];
          if (currentUnit) {
            const dynamicIntensity = motionPlannerRef.current.getCurrentUnitIntensity();
            const originalIntensity = currentUnit.intensity || 1.0;
            
            // 如果强度被修改，需要动态调整速度
            if (dynamicIntensity !== originalIntensity) {
              const intensityRatio = dynamicIntensity / originalIntensity;
              
              // 调整 stroke 速度
              if (keyframeResult.strokeSpeed !== undefined) {
                adjustedStrokeSpeed = keyframeResult.strokeSpeed * intensityRatio;
              }
              
              // 调整 rotation 速度（通过调整 rotation 值的变化率）
              // 由于 rotation 是累积值，需要根据时间差和速度来计算
              if (previousFrameRef.current !== null && previousTimestampRef.current !== null) {
                const timeDelta = (now - previousTimestampRef.current) / 1000; // 秒
                if (timeDelta > 0) {
                  const originalRotationDelta = frame.rotation - previousFrameRef.current.rotation;
                  const adjustedRotationDelta = originalRotationDelta * intensityRatio;
                  adjustedFrame = {
                    ...frame,
                    rotation: previousFrameRef.current.rotation + adjustedRotationDelta
                  };
                }
              }
              
              // 调整 stroke 位置的变化速度
              // stroke 是往复运动，速度影响往复频率
              // 由于 stroke 位置已经在 keyframe 中计算好，我们需要根据强度比例调整
              // 但更简单的方法是调整时间步长，或者重新计算 stroke 位置
              // 这里我们通过调整 stroke 的变化率来实现
              if (previousFrameRef.current !== null && previousTimestampRef.current !== null) {
                const timeDelta = (now - previousTimestampRef.current) / 1000;
                if (timeDelta > 0) {
                  const originalStrokeDelta = frame.stroke - previousFrameRef.current.stroke;
                  const adjustedStrokeDelta = originalStrokeDelta * intensityRatio;
                  adjustedFrame = {
                    ...adjustedFrame,
                    stroke: Math.max(0, Math.min(1, previousFrameRef.current.stroke + adjustedStrokeDelta))
                  };
                }
              }
            }
          }
        }
        
        // 更新当前 strokeSpeed（用于显示）
        setCurrentStrokeSpeed(adjustedStrokeSpeed);
        
        // 每100帧打印一次日志（避免日志过多）
        // if (Math.floor(relativeTime / 100) % 100 === 0) {
        //   console.log('[Motion] 生成帧 - relativeTime:', relativeTime, 'frame:', {
        //     stroke: frame.stroke.toFixed(3),
        //     rotation: frame.rotation.toFixed(3),
        //     intensity: frame.intensity.toFixed(3),
        //     strokeSpeed: strokeSpeed.toFixed(3)
        //   });
        // }
        setCurrentFrame(adjustedFrame);
        
        // 计算速度（变化率）
        if (previousFrameRef.current !== null && previousTimestampRef.current !== null) {
          const timeDelta = (now - previousTimestampRef.current) / 1000; // 转换为秒
          if (timeDelta > 0) {
            const strokeDelta = adjustedFrame.stroke - previousFrameRef.current.stroke;
            const rotationDelta = adjustedFrame.rotation - previousFrameRef.current.rotation;
            setStrokeVelocity(strokeDelta / timeDelta);
            setRotationVelocity(rotationDelta / timeDelta);
          }
        }
        
        previousFrameRef.current = adjustedFrame;
        previousTimestampRef.current = now;
        
        // 记录历史数据 - strokeHistory 存储速度值而不是位置值
        setStrokeHistory(prev => {
          const newHistory = [...prev, { timestamp: now, value: adjustedStrokeSpeed }];
          return newHistory.length > 1000 ? newHistory.slice(-1000) : newHistory;
        });
        setRotationHistory(prev => {
          const newHistory = [...prev, { timestamp: now, value: frame.rotation }];
          return newHistory.length > 1000 ? newHistory.slice(-1000) : newHistory;
        });

        // 检查时间线是否结束
        const lastKeyframe = motionTimeline[motionTimeline.length - 1];
        if (now - timelineStartTimeRef.current >= lastKeyframe.timestamp) {
          // 时间线结束，检查是否有待执行的指令
          executeNextCommand();
        }
      }
    } else {
      // 没有时间线，使用mock数据
      if (startTimeRef.current === null) {
        startTimeRef.current = now;
      }

      const elapsed = now - startTimeRef.current;
      const frame = mockRhythm(elapsed);
      setCurrentFrame(frame);
      
      // 计算速度（变化率）
      if (previousFrameRef.current !== null && previousTimestampRef.current !== null) {
        const timeDelta = (now - previousTimestampRef.current) / 1000;
        if (timeDelta > 0) {
          const strokeDelta = frame.stroke - previousFrameRef.current.stroke;
          const rotationDelta = frame.rotation - previousFrameRef.current.rotation;
          setStrokeVelocity(strokeDelta / timeDelta);
          setRotationVelocity(rotationDelta / timeDelta);
        }
      }
      
      previousFrameRef.current = frame;
      previousTimestampRef.current = now;
      
      // 记录历史数据
      setStrokeHistory(prev => {
        const newHistory = [...prev, { timestamp: now, value: frame.stroke }];
        return newHistory.length > 1000 ? newHistory.slice(-1000) : newHistory;
      });
      setRotationHistory(prev => {
        const newHistory = [...prev, { timestamp: now, value: frame.rotation }];
        return newHistory.length > 1000 ? newHistory.slice(-1000) : newHistory;
      });
    }

    animationFrameRef.current = requestAnimationFrame(generateTimelineFrame);
  }, [isRunning, motionState, motionTimeline, executeNextCommand]);

  // 处理运动指令
  const processMotionCommand = useCallback((command: DeviceMotionMessage) => {
    console.log('[Motion] processMotionCommand 被调用');
    console.log('[Motion] command:', command);
    console.log('[Motion] command.body:', command.body);
    
    const planner = motionPlannerRef.current;
    // 设置控制间隔
    planner.setControlInterval(controlInterval);
    
    if (command.body?.config) {
      console.log('[Motion] 处理 ConfigMessage');
      // ConfigMessage: 保存配置，继续当前运动
      planner.savePrimitives(command.body.config);
      setMotionLogs(planner.getLogs());
    } else if (command.body?.session) {
      console.log('[Motion] 处理 SessionMessage');
      console.log('[Motion] session:', command.body.session);
      // SessionMessage: 停止当前运动，生成新时间线
      setIsMotionCommandMode(true); // 设置为详细运动规划指令模式
      setMotionState(prevState => {
        if (prevState === MotionState.RUNNING) {
          return MotionState.IDLE;
        }
        return prevState;
      });
      
      console.log('[Motion] 开始生成时间线...');
      const timeline = planner.generateTimeline(command.body.session, 0);
      console.log('[Motion] 生成的时间线长度:', timeline.length);
      console.log('[Motion] 时间线前3个关键帧:', timeline.slice(0, 3));
      
      if (timeline.length > 0) {
        setMotionTimeline(timeline);
        timelineStartTimeRef.current = Date.now();
        setMotionState(MotionState.RUNNING);
        console.log('[Motion] 时间线已设置，motionState 设为 RUNNING');
        console.log('[Motion] timelineStartTime:', timelineStartTimeRef.current);
        
        // 保存 session 信息，用于 unit 切换日志
        currentSessionRef.current = {
          units: command.body.session.units?.map(unit => ({
            primitiveId: unit.primitiveId,
            iteration: unit.iteration,
            intensity: unit.intensity
          })) || []
        };
        currentUnitIndexRef.current = null; // 重置 unit 索引，确保第一个 unit 也能被检测到
        console.log('[Motion] 保存session信息:', {
          unitsCount: currentSessionRef.current.units.length,
          units: currentSessionRef.current.units
        });
        
        // 确保 isRunning 为 true
        setIsRunning(prev => {
          if (!prev) {
            console.log('[Motion] 启动运动 (isRunning 从 false 变为 true)');
            return true;
          }
          return prev;
        });
        
        // 先取消旧的动画循环（如果有），确保使用新的时间线
        // useEffect 会在状态更新后自动启动新的动画循环
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        console.log('[Motion] 时间线已设置，等待 useEffect 启动动画循环');
      } else {
        console.warn('[Motion] 生成的时间线为空，无法执行运动');
      }
      setMotionLogs(planner.getLogs());
    } else if (command.body?.control) {
      console.log('[Motion] 处理 ControlMessage');
      // ControlMessage: 处理控制指令
      const result = planner.handleControl(command.body.control);
      setMotionLogs(planner.getLogs());
      
      switch (result.action) {
        case 'reset':
          setMotionTimeline(result.timeline || []);
          setMotionState(MotionState.IDLE);
          if (result.timeline && result.timeline.length > 0) {
            timelineStartTimeRef.current = Date.now();
            setCurrentFrame(result.timeline[0].frame);
          }
          break;
        case 'pause':
          setMotionState(MotionState.PAUSED);
          pausedAtTimeRef.current = Date.now();
          // 取消当前的动画循环
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
          break;
        case 'resume':
          setMotionState(prevState => {
            if (prevState === MotionState.PAUSED && pausedAtTimeRef.current !== null) {
              // 调整时间线起始时间，补偿暂停的时间
              const pauseDuration = Date.now() - pausedAtTimeRef.current;
              if (timelineStartTimeRef.current !== null) {
                timelineStartTimeRef.current += pauseDuration;
              }
              pausedAtTimeRef.current = null;
            }
            return MotionState.RUNNING;
          });
          // 重新启动动画循环
          if (!animationFrameRef.current && isRunning && motionTimeline.length > 0 && !enableWS) {
            generateTimelineFrame();
          }
          break;
        case 'set_intensity':
          // 强度已由planner内部更新
          break;
      }
    }
  }, [controlInterval, generateTimelineFrame, isRunning, motionTimeline, enableWS]);

  // 更新ref
  useEffect(() => {
    processMotionCommandRef.current = processMotionCommand;
  }, [processMotionCommand]);

  // 将指令加入队列
  const queueCommand = useCallback((command: DeviceMotionMessage) => {
    setCommandQueue(prev => [...prev, command]);
  }, []);

  // 启动模拟
  const start = useCallback(() => {
    setIsRunning(true);
    startTimeRef.current = null;
    
    // 重置历史数据和速度
    setStrokeHistory([]);
    setRotationHistory([]);
    setStrokeVelocity(0);
    setRotationVelocity(0);
    setCurrentStrokeSpeed(0);
    previousFrameRef.current = null;
    previousTimestampRef.current = null;

    if (enableWS && wsUrl) {
      connectWS();
    } else {
      // 如果有时间线，使用时间线；否则使用 mock 数据
      if (motionTimeline.length > 0) {
        timelineStartTimeRef.current = Date.now();
        setMotionState(MotionState.RUNNING);
        generateTimelineFrame();
      } else {
        generateTimelineFrame();
      }
    }
  }, [enableWS, wsUrl, connectWS, generateTimelineFrame, motionTimeline]);

  // 停止模拟
  const stop = useCallback(() => {
    setIsMotionCommandMode(false); // 退出详细运动规划指令模式
    setIsRunning(false);
    setMotionState(MotionState.IDLE);
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    startTimeRef.current = null;
    timelineStartTimeRef.current = null;
    pausedAtTimeRef.current = null;
    currentUnitIndexRef.current = null;
    currentSessionRef.current = null;
    disconnectWS();
    setCurrentFrame(null);
    
    // 清理历史数据，释放内存
    setStrokeHistory([]);
    setRotationHistory([]);
    setStrokeVelocity(0);
    setRotationVelocity(0);
    setCurrentStrokeSpeed(0);
    previousFrameRef.current = null;
    previousTimestampRef.current = null;
  }, [disconnectWS]);

  // 当 WebSocket 连接且有数据时，停止 mock 循环
  useEffect(() => {
    if (isWSConnected && wsFrame && isRunning) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    } else if (!isWSConnected && isRunning && !enableWS) {
      // WebSocket 未连接且未启用，使用时间线或 mock
      if (!animationFrameRef.current) {
        generateTimelineFrame();
      }
    }
  }, [isWSConnected, wsFrame, isRunning, enableWS, generateTimelineFrame]);

  // 当时间线生成且状态就绪时，自动启动动画循环
  useEffect(() => {
    if (isRunning && motionTimeline.length > 0 && motionState === MotionState.RUNNING && !enableWS) {
      // 如果还没有动画循环在运行，启动它
      if (!animationFrameRef.current) {
        console.log('[Motion] 检测到时间线就绪，自动启动动画循环');
        generateTimelineFrame();
      }
    }
  }, [isRunning, motionTimeline.length, motionState, enableWS, generateTimelineFrame]);

  // 清理
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      disconnectWS();
    };
  }, [disconnectWS]);

  // 清理旧数据（只保留最近10秒的数据）
  // 使用更激进的清理策略：限制数组最大长度，并定期清理
  useEffect(() => {
    if (!isRunning) return;

    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const cutoff = now - 10000; // 10秒前

      setStrokeHistory(prev => {
        // 限制最大长度，避免数组无限增长
        const filtered = prev.filter(point => point.timestamp >= cutoff);
        // 如果过滤后仍然很长，只保留最新的500条
        return filtered.length > 500 ? filtered.slice(-500) : filtered;
      });
      
      setRotationHistory(prev => {
        const filtered = prev.filter(point => point.timestamp >= cutoff);
        return filtered.length > 500 ? filtered.slice(-500) : filtered;
      });
    }, 2000); // 每2秒清理一次，减少频率

    return () => clearInterval(cleanupInterval);
  }, [isRunning]);

  // 同步日志
  useEffect(() => {
    const logs = motionPlannerRef.current.getLogs();
    setMotionLogs(logs);
  }, [motionTimeline, motionState]);

  // 清空运动日志
  const clearMotionLogs = useCallback(() => {
    motionPlannerRef.current.clearLogs();
    setMotionLogs([]);
  }, []);

  return {
    isRunning,
    currentFrame,
    isWSConnected,
    strokeHistory,
    rotationHistory,
    strokeVelocity,
    rotationVelocity,
    currentStrokeSpeed,
    motionLogs,
    controlInterval,
    setControlInterval,
    isMotionCommandMode,
    motionTimeline,
    motionState,
    start,
    stop,
    processMotionCommand,
    queueCommand,
    clearMotionLogs
  };
}

