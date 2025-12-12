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

  // 运动规划相关状态
  const motionPlannerRef = useRef<MotionPlanner>(new MotionPlanner());
  const [motionTimeline, setMotionTimeline] = useState<TimelineKeyframe[]>([]);
  const [motionState, setMotionState] = useState<MotionState>(MotionState.IDLE);
  const [commandQueue, setCommandQueue] = useState<DeviceMotionMessage[]>([]);
  const [motionLogs, setMotionLogs] = useState<MotionLog[]>([]);
  const pausedAtTimeRef = useRef<number | null>(null);
  const timelineStartTimeRef = useRef<number | null>(null);
  const processMotionCommandRef = useRef<((command: DeviceMotionMessage) => void) | null>(null);

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
      const frame = motionPlannerRef.current.getFrameAtTime(
        motionTimeline,
        now,
        timelineStartTimeRef.current
      );
      
      if (frame) {
        // 每100帧打印一次日志（避免日志过多）
        if (Math.floor(relativeTime / 100) % 100 === 0) {
          console.log('[Motion] 生成帧 - relativeTime:', relativeTime, 'frame:', {
            stroke: frame.stroke.toFixed(3),
            rotation: frame.rotation.toFixed(3),
            intensity: frame.intensity.toFixed(3)
          });
        }
        setCurrentFrame(frame);
        
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
        
        // 记录历史数据
        setStrokeHistory(prev => {
          const newHistory = [...prev, { timestamp: now, value: frame.stroke }];
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
    
    if (command.body?.config) {
      console.log('[Motion] 处理 ConfigMessage');
      // ConfigMessage: 保存配置，继续当前运动
      planner.savePrimitives(command.body.config);
      setMotionLogs(planner.getLogs());
    } else if (command.body?.session) {
      console.log('[Motion] 处理 SessionMessage');
      console.log('[Motion] session:', command.body.session);
      // SessionMessage: 停止当前运动，生成新时间线
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
        
        // 如果当前没有运行，启动运动
        setIsRunning(prev => {
          if (!prev) {
            console.log('[Motion] 启动运动 (isRunning 从 false 变为 true)');
            return true;
          }
          return prev;
        });
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
          break;
        case 'set_intensity':
          // 强度已由planner内部更新
          break;
      }
    }
  }, []);

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
    setIsRunning(false);
    setMotionState(MotionState.IDLE);
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    startTimeRef.current = null;
    timelineStartTimeRef.current = null;
    pausedAtTimeRef.current = null;
    disconnectWS();
    setCurrentFrame(null);
    
    // 清理历史数据，释放内存
    setStrokeHistory([]);
    setRotationHistory([]);
    setStrokeVelocity(0);
    setRotationVelocity(0);
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
    motionLogs,
    start,
    stop,
    processMotionCommand,
    queueCommand,
    clearMotionLogs
  };
}

