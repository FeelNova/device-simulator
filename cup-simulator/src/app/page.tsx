'use client';

/**
 * 主模拟器页面组件
 * 简化的版本，移除了 Companion 和 Scenario 选择器
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSimulator } from '@/hooks/useSimulator';
import RhythmCanvas from '@/components/RhythmCanvas';
import StrokeTimelineChart from '@/components/simulator/StrokeTimelineChart';
import RotationTimelineChart from '@/components/simulator/RotationTimelineChart';

// 调试数据类型
interface DebugMessage {
  id: string;
  timestamp: number;
  type: 'upstream' | 'downstream';
  data: any;
}

const MAX_DEBUG_MESSAGES = 100; // 最大消息数量

export default function SimulatorPage() {
  // Token 和 Online 状态
  const [token, setToken] = useState<string>('hw2020515');
  const [mqttBroker, setMqttBroker] = useState<string>('mqtts://ip:port');
  const [isOnline, setIsOnline] = useState<boolean>(false);
  
  // 调试数据
  const [upstreamMessages, setUpstreamMessages] = useState<DebugMessage[]>([]);
  const [downstreamMessages, setDownstreamMessages] = useState<DebugMessage[]>([]);

  // 添加上行消息的辅助函数
  const addUpstreamMessage = useCallback((data: any) => {
    const message: DebugMessage = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      type: 'upstream',
      data
    };
    setUpstreamMessages(prev => {
      const newMessages = [message, ...prev]; // 新消息在前面（倒序）
      return newMessages.slice(0, MAX_DEBUG_MESSAGES); // 限制最大数量
    });
  }, []);

  // 添加下行消息的辅助函数
  const addDownstreamMessage = useCallback((data: any) => {
    const message: DebugMessage = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      type: 'downstream',
      data
    };
    setDownstreamMessages(prev => {
      const newMessages = [message, ...prev]; // 新消息在前面（倒序）
      return newMessages.slice(0, MAX_DEBUG_MESSAGES); // 限制最大数量
    });
  }, []);
  const {
    isRunning,
    currentFrame,
    isWSConnected,
    strokeHistory,
    rotationHistory,
    strokeVelocity,
    rotationVelocity,
    start,
    stop
  } = useSimulator({
    useWebSocket: false, // 默认使用 mock 模式，可以通过环境变量或配置启用
    wsUrl: process.env.NEXT_PUBLIC_WS_URL
  });

  // 验证 MQTT broker 地址是否合法
  const isValidMqttBroker = useCallback((broker: string): boolean => {
    if (!broker.trim()) return false;
    
    try {
      const url = new URL(broker);
      // 支持 mqtt://, mqtts://, ws://, wss:// 协议
      const validProtocols = ['mqtt:', 'mqtts:', 'ws:', 'wss:'];
      if (!validProtocols.includes(url.protocol)) {
        return false;
      }
      // 必须有 hostname
      if (!url.hostname) {
        return false;
      }
      // 如果有端口，必须是数字
      if (url.port && isNaN(parseInt(url.port))) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  // 检查是否可以连接（token 不为空且 broker 地址合法）
  const canConnect = useMemo(() => {
    return token.trim() !== '' && isValidMqttBroker(mqttBroker);
  }, [token, mqttBroker, isValidMqttBroker]);

  // 监听 isOnline 变化：如果从 online 变成 offline 且 simulation 正在运行，则停止
  useEffect(() => {
    if (!isOnline && isRunning) {
      stop();
    }
  }, [isOnline, isRunning, stop]);

  return (
    <div className="min-h-screen bg-[#0c0e12] py-8 md:py-16">
      <div className="max-w-[1920px] mx-auto px-4 md:px-[120px]">
        {/* 标题 */}
        <div className="mb-8 md:mb-12">
          <h1 className="text-3xl md:text-4xl lg:text-[52px] leading-normal text-white font-normal mb-4 tracking-[-1.04px]">
            Device Rhythm Simulator
          </h1>
          <p className="text-base md:text-lg text-white/70 leading-[28px]">
            Experience the rhythm engine in real-time. Start the simulation to begin.
          </p>
        </div>

        {/* 主内容区域 - 控制面板和3D可视化并排显示 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-8">
          {/* 控制面板 - 左侧 */}
          <div className="bg-white/5 rounded-lg border border-white/10 p-6 md:p-8 space-y-6">
            {/* MQTT Broker 和 Token 输入和 Online 按钮 */}
            <div className="space-y-3">
              {/* MQTT Broker 地址输入 */}
              <div>
                <label className="block text-sm text-white/70 mb-2">
                  MQTT Broker
                </label>
                <input
                  type="text"
                  value={mqttBroker}
                  onChange={(e) => setMqttBroker(e.target.value)}
                  placeholder="mqtts://ip:port"
                  disabled={isOnline}
                  className={`w-full px-4 py-2 bg-white/5 border rounded-lg text-white placeholder:text-white/30 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                    mqttBroker.trim() && !isValidMqttBroker(mqttBroker) && !isOnline
                      ? 'border-red-500/50 focus:border-red-500/70'
                      : 'border-white/10 focus:border-white/30'
                  }`}
                />
                {mqttBroker.trim() && !isValidMqttBroker(mqttBroker) && !isOnline && (
                  <p className="mt-1 text-xs text-red-400">Invalid MQTT broker address</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-2">
                  Device Token
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Enter device token"
                    disabled={isOnline}
                    className={`flex-1 px-4 py-2 bg-white/5 border rounded-lg text-white placeholder:text-white/30 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                      !token.trim() && !isOnline
                        ? 'border-red-500/50 focus:border-red-500/70'
                        : 'border-white/10 focus:border-white/30'
                    }`}
                  />
                  <button
                    onClick={() => {
                      if (isOnline) {
                        setIsOnline(false);
                        // TODO: 断开 MQTT 连接
                      } else {
                        if (canConnect) {
                          setIsOnline(true);
                          // TODO: 建立 MQTT 连接
                        }
                      }
                    }}
                    disabled={!canConnect && !isOnline}
                    className={`px-6 py-2 rounded-lg font-semibold text-sm transition-colors ${
                      isOnline
                        ? 'bg-red-500/20 border border-red-500/50 text-red-200 hover:bg-red-500/30'
                        : 'bg-blue-500/20 border border-blue-500/50 text-blue-200 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                  >
                    {isOnline ? 'Offline' : 'Online'}
                  </button>
                </div>
              </div>
              
              {isOnline && (
                <div className="flex items-center gap-2 text-xs text-green-400">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span>MQTT Connected</span>
                </div>
              )}
            </div>

            {/* 状态信息 */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    isRunning ? 'bg-green-500' : 'bg-gray-500'
                  }`}
                />
                <span className="text-sm text-white/70">
                  {isRunning ? 'Running' : 'Stopped'}
                </span>
              </div>
              {isWSConnected ? (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-sm text-white/70">WebSocket Connected</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <span className="text-sm text-white/70">Mock Mode</span>
                </div>
              )}
            </div>

            {/* 开始/停止按钮 */}
            <button
              onClick={isRunning ? stop : start}
              disabled={!isOnline && !isRunning}
              className={`w-full px-8 py-3 rounded-lg font-semibold text-base transition-colors ${
                isRunning
                  ? 'bg-red-500/20 border border-red-500/50 text-red-200 hover:bg-red-500/30'
                  : isOnline
                  ? 'bg-white/10 border border-white/20 text-white hover:bg-white/20'
                  : 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed'
              }`}
            >
              {isRunning ? 'Stop Simulation' : 'Start Simulation'}
            </button>

            {/* 调试区域 */}
            <div className="space-y-4 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Debug Console</h3>
                <button
                  onClick={() => {
                    setUpstreamMessages([]);
                    setDownstreamMessages([]);
                  }}
                  className="text-xs text-white/50 hover:text-white/70 transition-colors"
                >
                  Clear All
                </button>
              </div>

              {/* 上行数据 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-white/70">Upstream Data</h4>
                  <button
                    onClick={() => setUpstreamMessages([])}
                    className="text-xs text-white/50 hover:text-white/70 transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div className="bg-black/30 rounded-lg border border-white/10 p-3 max-h-[150px] overflow-y-auto space-y-2">
                  {upstreamMessages.length === 0 ? (
                    <div className="text-xs text-white/30 text-center py-2">No upstream data</div>
                  ) : (
                    upstreamMessages.map((msg) => (
                      <div key={msg.id} className="text-xs font-mono border-b border-white/5 pb-2 last:border-0 last:pb-0">
                        <div className="text-white/50 mb-1">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </div>
                        <div className="text-green-400 break-all whitespace-pre-wrap">
                          {JSON.stringify(msg.data, null, 2)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 下行指令 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-white/70">Downstream Commands</h4>
                  <button
                    onClick={() => setDownstreamMessages([])}
                    className="text-xs text-white/50 hover:text-white/70 transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div className="bg-black/30 rounded-lg border border-white/10 p-3 max-h-[150px] overflow-y-auto space-y-2">
                  {downstreamMessages.length === 0 ? (
                    <div className="text-xs text-white/30 text-center py-2">No downstream commands</div>
                  ) : (
                    downstreamMessages.map((msg) => (
                      <div key={msg.id} className="text-xs font-mono border-b border-white/5 pb-2 last:border-0 last:pb-0">
                        <div className="text-white/50 mb-1">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </div>
                        <div className="text-blue-400 break-all whitespace-pre-wrap">
                          {JSON.stringify(msg.data, null, 2)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 3D 可视化 - 右侧 */}
          <div className="bg-white/5 rounded-lg border border-white/10 p-6 md:p-8 flex flex-col">
            <h2 className="text-xl md:text-2xl text-white font-medium mb-4">
              3D Device Visualization
            </h2>
            
            {/* 3D场景和图表并排显示 */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {/* 左侧：3D场景 */}
              <div className="w-full h-[500px] md:h-[600px] lg:h-full lg:min-h-[500px]">
                <RhythmCanvas frame={currentFrame} />
              </div>
              
              {/* 右侧：时间轴图表 */}
              <div className="flex flex-col gap-4">
                {/* Stroke 时间轴图表 */}
                <div className="h-[200px] md:h-[250px] lg:h-[280px] flex flex-col">
                  <h3 className="text-sm text-white/70 mb-2 flex-shrink-0">Stroke Timeline</h3>
                  <div className="flex-1 min-h-0">
                    <StrokeTimelineChart data={strokeHistory} />
                  </div>
                </div>
                
                {/* Rotation 时间轴图表 */}
                <div className="h-[200px] md:h-[250px] lg:h-[280px] flex flex-col">
                  <h3 className="text-sm text-white/70 mb-2 flex-shrink-0">Rotation Timeline</h3>
                  <div className="flex-1 min-h-0">
                    <RotationTimelineChart data={rotationHistory} />
                  </div>
                </div>
              </div>
            </div>
            
            {/* 实时参数显示 - 在画布下方，与左侧控制面板对齐，始终显示 */}
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-white/50">Stroke Speed:</span>
                  <span className="text-white ml-2">
                    {Math.abs(strokeVelocity).toFixed(3)}/s
                  </span>
                </div>
                <div>
                  <span className="text-white/50">Rotation Speed:</span>
                  <span className="text-white ml-2">
                    {rotationVelocity.toFixed(3)}/s
                  </span>
                </div>
                <div>
                  <span className="text-white/50">Suck:</span>
                  <span className="text-white ml-2">
                    {currentFrame ? currentFrame.suck.toFixed(3) : '0.500'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

