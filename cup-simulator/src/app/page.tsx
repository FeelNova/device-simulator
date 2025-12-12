'use client';

/**
 * 主模拟器页面组件
 * 简化的版本，移除了 Companion 和 Scenario 选择器
 */

import { useState, useEffect, useCallback } from 'react';
import { useSimulator } from '@/hooks/useSimulator';
import { useMQTT, MQTTLog } from '@/hooks/useMQTT';
import * as protobuf from 'protobufjs';
import { decodeDeviceMotionMessage } from '@/lib/protobuf/decoder';
import { DeviceMotionMessage } from '@/lib/protobuf/types';
import RhythmCanvas from '@/components/RhythmCanvas';
import StrokeTimelineChart from '@/components/simulator/StrokeTimelineChart';
import RotationTimelineChart from '@/components/simulator/RotationTimelineChart';

// 调试数据类型
interface DebugMessage {
  id: string;
  timestamp: number;
  type: 'upstream' | 'downstream';
  data: any;
  clientId?: string;
  topic?: string;
  binaryData?: Uint8Array | Buffer;
}

// 运动任务数据类型
interface MotionTask {
  id: string;
  name: string;
  data: Uint8Array;
}

const MAX_DEBUG_MESSAGES = 100; // 最大消息数量

export default function SimulatorPage() {
  // 调试数据
  const [upstreamMessages, setUpstreamMessages] = useState<DebugMessage[]>([]);
  const [downstreamMessages, setDownstreamMessages] = useState<DebugMessage[]>([]);
  
  // MQTT 连接配置
  const [brokerUrl, setBrokerUrl] = useState<string>('wss://www.feelnova-ai.com/mqtt/');
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('Nova#123');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  
  // 设备注册
  const [deviceToken, setDeviceToken] = useState<string>('hw2020515');
  const [isDeviceRegistered, setIsDeviceRegistered] = useState<boolean>(false);
  
  // 订阅状态
  const [subscribedTopic, setSubscribedTopic] = useState<string | null>(null);
  
  // MQTT 日志
  const [mqttLogs, setMqttLogs] = useState<MQTTLog[]>([]);

  // 运动规划任务
  const [motionTasks, setMotionTasks] = useState<MotionTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');

  const {
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
  } = useSimulator({
    useWebSocket: false, // 默认使用 mock 模式，可以通过环境变量或配置启用
    wsUrl: process.env.NEXT_PUBLIC_WS_URL
  });
  
  // 处理日志回调
  const handleMQTTLog = useCallback((log: MQTTLog) => {
    setMqttLogs(prev => [log, ...prev].slice(0, 100)); // 保留最近100条日志
  }, []);

  // 下载二进制数据函数
  const downloadBinary = useCallback((binaryData: Uint8Array | Buffer, filename: string = 'message.bin') => {
    // 处理 Buffer 到 Uint8Array 的转换，确保使用标准的 ArrayBuffer
    let data: Uint8Array;
    if (binaryData instanceof Buffer) {
      // Buffer 转 Uint8Array
      data = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        data[i] = binaryData[i];
      }
    } else {
      data = binaryData;
    }
    // 创建一个新的 ArrayBuffer 并复制数据，避免 SharedArrayBuffer 的问题
    const arrayBuffer = new ArrayBuffer(data.length);
    const view = new Uint8Array(arrayBuffer);
    view.set(data);
    const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // 渲染消息数据，特殊处理 commandType=3 的情况
  const renderMessageData = useCallback((data: any, textColorClass: string = '') => {
    // 如果 commandType=3 且 commandData 不为空，特殊处理
    if (data.commandType === 3 && data.commandData && data.commandData.length > 0) {
      // 创建新的对象，排除 commandData
      const { commandData, decodedCommandData, ...rest } = data;
      
      // 构建显示对象
      const displayData = { ...rest };
      
      if (decodedCommandData) {
        // 反序列化成功
        displayData['commandData (decoded)'] = decodedCommandData;
      } else {
        // 反序列化失败
        displayData['commandData (decoded)'] = 'decoded failed';
      }
      
      return (
        <div>
          {Object.entries(displayData).map(([key, value]) => (
            <div key={key} className="mb-1">
              <span className="text-white/70">
                {key === 'commandData (decoded)' ? (
                  <>
                    commandData <span className="text-red-400">(decoded)</span>:
                  </>
                ) : (
                  `${key}:`
                )}
              </span>
              <pre className={`${textColorClass} mt-0.5 ml-4 whitespace-pre-wrap`}>
                {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
              </pre>
            </div>
          ))}
        </div>
      );
    }
    
    // 普通情况，使用 JSON.stringify
    return (
      <pre className="whitespace-pre-wrap">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }, []);

  // 处理文件上传
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 读取文件为 ArrayBuffer
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const data = new Uint8Array(arrayBuffer);
      
      // 弹出输入框让用户输入任务名称
      const taskName = prompt('请输入任务名称:', file.name);
      if (!taskName || !taskName.trim()) {
        alert('任务名称不能为空');
        return;
      }

      // 创建新任务
      const newTask: MotionTask = {
        id: `${Date.now()}-${Math.random()}`,
        name: taskName.trim(),
        data: data
      };

      // 添加到任务列表并保存到 localStorage
      setMotionTasks(prev => {
        const updated = [...prev, newTask];
        localStorage.setItem('motionTasks', JSON.stringify(updated.map(t => ({
          id: t.id,
          name: t.name,
          data: Array.from(t.data) // 转换为数组以便 JSON 序列化
        }))));
        return updated;
      });

      // 自动选中新添加的任务
      setSelectedTaskId(newTask.id);
    };
    reader.readAsArrayBuffer(file);
    
    // 清空 input，允许重复上传同一文件
    event.target.value = '';
  }, []);

  // 处理 MQTT 消息
  const handleMQTTMessage = useCallback(async (topic: string, message: Buffer) => {
    const timestamp = Date.now();
    
    // 添加到 Subscribed 区域
    try {
      // 尝试解码 DeviceCommand 消息
      if (topic === `device/command/${deviceToken}`) {
        try {
          const root = await protobuf.load('/device.proto');
          const DeviceCommand = root.lookupType('com.sexToy.proto.DeviceCommand');
          
          
         

          const decoded = DeviceCommand.decode(message) as any;
         
          
          // 直接访问 decoded 对象的字段（protobufjs 会将字段名转换为 camelCase）
          // protobufjs 解码后的对象字段名是 camelCase（deviceToken, commandType, commandData）
          const messageObj: any = {};
          
          if (decoded.deviceToken !== undefined && decoded.deviceToken !== null && decoded.deviceToken !== '') {
            messageObj.deviceToken = decoded.deviceToken;
          }
          if (decoded.commandType !== undefined && decoded.commandType !== null) {
            messageObj.commandType = decoded.commandType;
          }
          if (decoded.commandData !== undefined && decoded.commandData !== null && decoded.commandData.length > 0) {
            // commandData 是 bytes，转换为数组以便 JSON 序列化
            messageObj.commandData = Array.from(decoded.commandData);
            
            console.log('[MQTT] 收到消息，commandType:', decoded.commandType);
            console.log('[MQTT] commandData length:', decoded.commandData.length);
            
            // 如果 commandType=3 (COMMAND_TASK)，尝试反序列化 commandData
            if (decoded.commandType === 3) {
              console.log('[MQTT] 开始解码 DeviceMotionMessage...');
              try {
                const decodedMotion = await decodeDeviceMotionMessage(decoded.commandData);
                console.log('[MQTT] DeviceMotionMessage 解码成功:', decodedMotion);
                messageObj.decodedCommandData = decodedMotion;
              } catch (error) {
                console.error('[MQTT] DeviceMotionMessage 解码失败:', error);
                // 反序列化失败时，不添加 decodedCommandData 字段
              }
            }
          }
          if (decoded.timestamp !== undefined && decoded.timestamp !== null) {
            // timestamp 是 uint64，protobufjs 可能返回 Long 对象或字符串
            // 转换为数字（毫秒时间戳）
            const ts = decoded.timestamp;
            if (typeof ts === 'object' && ts !== null && 'toNumber' in ts) {
              messageObj.timestamp = ts.toNumber();
            } else if (typeof ts === 'string') {
              messageObj.timestamp = parseInt(ts, 10);
            } else {
              messageObj.timestamp = Number(ts);
            }
          }

          // 添加到 Subscribed 区域（显示解码后的 JSON）
          setDownstreamMessages(prev => [{
            id: `${timestamp}-${Math.random()}`,
            timestamp: timestamp,
            type: 'downstream' as const,
            data: messageObj,
            topic: topic,
            binaryData: message
          }, ...prev].slice(0, MAX_DEBUG_MESSAGES));

          // 根据 commandType 控制 3D 动画
          // commandType 可能是数字（枚举值）
          const commandType = typeof messageObj.commandType === 'number' 
            ? messageObj.commandType 
            : (messageObj.commandType || 0);
          
          if (commandType === 1) { // COMMAND_START
            start();
          } else if (commandType === 2) { // COMMAND_STOP
            stop();
          } else if (commandType === 3) { // COMMAND_TASK
            console.log('[MQTT] 收到 COMMAND_TASK=3 消息');
            console.log('[MQTT] decodedCommandData:', messageObj.decodedCommandData);
            console.log('[MQTT] isRunning:', isRunning);
            
            // 处理详细任务控制指令
            if (messageObj.decodedCommandData) {
              const decoded = messageObj.decodedCommandData;
              const bodyType = decoded.body; // "config" | "session" | "control"
              
              // 添加调试日志
              console.log('[MQTT] decodedCommandData.body (type):', bodyType);
              console.log('[MQTT] decodedCommandData.config:', decoded.config);
              console.log('[MQTT] decodedCommandData.session:', decoded.session);
              console.log('[MQTT] decodedCommandData.control:', decoded.control);
              
              // 根据 body 字符串值，从顶层字段获取实际数据
              const motionMessage: DeviceMotionMessage = {
                body: bodyType === 'config' && decoded.config
                  ? { config: decoded.config }
                  : bodyType === 'session' && decoded.session
                  ? { session: decoded.session }
                  : bodyType === 'control' && decoded.control
                  ? { control: decoded.control }
                  : undefined
              };
              
              console.log('[MQTT] 构建的 motionMessage:', motionMessage);
              console.log('[MQTT] motionMessage.body:', motionMessage.body);
              
              if (!motionMessage.body) {
                console.warn('[MQTT] 无法构建 motionMessage，body 为空');
                return;
              }
              
              // 如果当前有运动在执行，将指令加入队列；否则立即执行
              if (isRunning) {
                console.log('[MQTT] 当前有运动在执行，将指令加入队列');
                queueCommand(motionMessage);
              } else {
                console.log('[MQTT] 当前无运动，立即执行指令');
                processMotionCommand(motionMessage);
                // 如果生成了时间线，自动启动运动
                if (motionMessage.body?.session) {
                  console.log('[MQTT] 检测到 SessionMessage，自动启动运动');
                  start();
                }
              }
            } else {
              console.warn('[MQTT] decodedCommandData 为空，无法处理运动指令');
            }
          }
        } catch (decodeError) {
          // 解码失败，显示原始消息
          const hexString = Array.from(message)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ');
          setDownstreamMessages(prev => [{
            id: `${timestamp}-${Math.random()}`,
            timestamp: timestamp,
            type: 'downstream' as const,
            data: { raw: hexString, error: 'Failed to decode DeviceCommand' },
            topic: topic,
            binaryData: message
          }, ...prev].slice(0, MAX_DEBUG_MESSAGES));
        }
      } else {
        // 其他 topic 的消息，显示为字符串或 hex
        try {
          const messageStr = message.toString('utf-8');
          setDownstreamMessages(prev => [{
            id: `${timestamp}-${Math.random()}`,
            timestamp: timestamp,
            type: 'downstream' as const,
            data: messageStr,
            topic: topic,
            binaryData: message
          }, ...prev].slice(0, MAX_DEBUG_MESSAGES));
        } catch {
          const hexString = Array.from(message)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ');
          setDownstreamMessages(prev => [{
            id: `${timestamp}-${Math.random()}`,
            timestamp: timestamp,
            type: 'downstream' as const,
            data: { raw: hexString },
            topic: topic,
            binaryData: message
          }, ...prev].slice(0, MAX_DEBUG_MESSAGES));
        }
      }
    } catch (error) {
      console.error('Failed to process MQTT message:', error);
    }
  }, [deviceToken, start, stop]);

  // 从 localStorage 加载运动任务
  useEffect(() => {
    try {
      const saved = localStorage.getItem('motionTasks');
      if (saved) {
        const tasks = JSON.parse(saved).map((t: any) => ({
          id: t.id,
          name: t.name,
          data: new Uint8Array(t.data) // 从数组恢复为 Uint8Array
        }));
        setMotionTasks(tasks);
      }
    } catch (error) {
      console.error('Failed to load motion tasks from localStorage:', error);
    }
  }, []);
  
  // MQTT 连接
  const {
    isConnected: isMQTTConnected,
    connect: connectMQTT,
    disconnect: disconnectMQTT,
    publish: publishMQTT,
    subscribe: subscribeMQTT,
    subscribedTopics,
    client: mqttClient
  } = useMQTT({
    url: brokerUrl,
    username: username,
    password: password,
    clientId: 'CupSimulator',
    onLog: handleMQTTLog,
    onMessage: handleMQTTMessage,
    onDisconnect: () => {
      // 断开连接时重置注册状态
      setIsDeviceRegistered(false);
      setSubscribedTopic(null);
    }
  });

  // 处理下发任务
  const handleSendTask = useCallback(async () => {
    if (!isMQTTConnected) {
      alert('Please connect to MQTT broker first');
      return;
    }

    if (!deviceToken.trim()) {
      alert('Please enter device token first');
      return;
    }

    if (!selectedTaskId) {
      alert('Please select a motion task');
      return;
    }

    const selectedTask = motionTasks.find(t => t.id === selectedTaskId);
    if (!selectedTask) {
      alert('Selected task not found');
      return;
    }

    try {
      // 加载 protobuf 定义
      const root = await protobuf.load('/device.proto');
      const DeviceCommand = root.lookupType('com.sexToy.proto.DeviceCommand');

      // 创建消息对象，commandType 设置为 3 (COMMAND_TASK)
      const message: any = {
        deviceToken: deviceToken,
        commandType: 3, // COMMAND_TASK
        commandData: selectedTask.data, // 使用选中任务的二进制数据
        timestamp: Date.now()
      };

      // 验证消息
      const errMsg = DeviceCommand.verify(message);
      if (errMsg) {
        throw new Error(`Invalid message: ${errMsg}`);
      }

      // 创建消息实例并序列化
      const deviceCommandMsg = DeviceCommand.create(message);
      const uint8Array = DeviceCommand.encode(deviceCommandMsg).finish();
      const buffer = Buffer.from(uint8Array) as any;

      // 发布消息
      const topic = `device/command/${deviceToken}`;
      const currentClientId = (mqttClient as any)?.options?.clientId || 'CupSimulator';
      
      console.log('[SendTask] 准备发送任务指令');
      console.log('[SendTask] commandType:', message.commandType);
      console.log('[SendTask] commandData length:', message.commandData?.length || 0);
      console.log('[SendTask] topic:', topic);
      
      publishMQTT(topic, buffer, { qos: 1 }, async (error?: Error) => {
        if (!error) {
          console.log('[SendTask] MQTT 发布成功');
          
          // 如果 commandType=3 且 commandData 不为空，尝试反序列化
          let decodedCommandData = undefined;
          if (message.commandType === 3 && message.commandData && message.commandData.length > 0) {
            try {
              console.log('[SendTask] 开始解码 DeviceMotionMessage, 数据长度:', message.commandData.length);
              decodedCommandData = await decodeDeviceMotionMessage(message.commandData);
              console.log('[SendTask] 解码成功:', decodedCommandData);
            } catch (error) {
              console.error('[SendTask] 解码失败:', error);
            }
          } else {
            console.log('[SendTask] 跳过解码 (commandType不是3或commandData为空)');
          }
          
          // 添加到 Published 区域
          const messageData = { ...message };
          if (decodedCommandData) {
            messageData.decodedCommandData = decodedCommandData;
          }
          
          setUpstreamMessages(prev => [{
            id: `${Date.now()}-${Math.random()}`,
            timestamp: Date.now(),
            type: 'upstream' as const,
            data: messageData,
            clientId: currentClientId,
            topic: topic,
            binaryData: buffer
          }, ...prev].slice(0, MAX_DEBUG_MESSAGES));
        }
      });
    } catch (error) {
      console.error('Failed to send task command:', error);
      alert(`Failed to send task command: ${(error as Error).message}`);
    }
  }, [isMQTTConnected, deviceToken, selectedTaskId, motionTasks, mqttClient, publishMQTT, setUpstreamMessages]);

  // 清理调试消息，避免内存泄漏
  useEffect(() => {
    // 定期清理超过最大数量的消息
    const cleanupInterval = setInterval(() => {
      setUpstreamMessages(prev => prev.slice(0, MAX_DEBUG_MESSAGES));
      setDownstreamMessages(prev => prev.slice(0, MAX_DEBUG_MESSAGES));
    }, 5000); // 每5秒清理一次

    return () => clearInterval(cleanupInterval);
  }, []);

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
            {/* MQTT 连接控制 */}
            <div className="space-y-4">
              {/* Broker URL */}
              <div>
                <label className="block text-sm text-white/70 mb-2">Broker URL</label>
                <input
                  type="text"
                  value={brokerUrl}
                  onChange={(e) => setBrokerUrl(e.target.value)}
                  placeholder="ws://www.feelnova-ai.com:8083/mqtt"
                  disabled={isMQTTConnected}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* Username */}
              <div>
                <label className="block text-sm text-white/70 mb-2">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  disabled={isMQTTConnected}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm text-white/70 mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nova#123"
                    disabled={isMQTTConnected}
                    className="w-full px-4 py-2 pr-10 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isMQTTConnected}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Connect/Disconnect 按钮 */}
              <div>
                <button
                  onClick={() => {
                    if (isMQTTConnected) {
                      disconnectMQTT();
                    } else {
                      connectMQTT();
                    }
                  }}
                  className={`w-full px-6 py-2 rounded-lg font-semibold text-sm transition-colors active:scale-95 active:opacity-80 ${
                    isMQTTConnected
                      ? 'bg-red-500/20 border border-red-500/50 text-red-200 hover:bg-red-500/30'
                      : 'bg-blue-500/20 border border-blue-500/50 text-blue-200 hover:bg-blue-500/30'
                  }`}
                >
                  {isMQTTConnected ? 'Disconnect' : 'Connect'}
                </button>
                
                {isMQTTConnected && (
                  <div className="flex items-center gap-2 text-xs text-green-400 mt-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span>MQTT Connected</span>
                  </div>
                )}
              </div>

              {/* 分隔线 */}
              <div className="border-t border-white/10 pt-4 mt-4">
                {/* 设备注册 */}
                <div className="space-y-3">
                  <label className="block text-sm text-white/70 mb-2">Device Registration</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={deviceToken}
                      onChange={(e) => setDeviceToken(e.target.value)}
                      placeholder="hw2020515"
                      disabled={isDeviceRegistered}
                      className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <button
                      onClick={async () => {
                        if (!isMQTTConnected) {
                          alert('Please connect to MQTT broker first');
                          return;
                        }

                        try {
                          // 加载 protobuf 定义
                          const root = await protobuf.load('/device.proto');
                          const DeviceRegister = root.lookupType('com.sexToy.proto.DeviceRegister');

                          // 创建消息对象
                          const message = {
                            deviceToken: deviceToken,
                            deviceSn: 'CUP001',
                            deviceType: 'massager',
                            registerTime: Date.now()
                          };

                          // 验证消息
                          const errMsg = DeviceRegister.verify(message);
                          if (errMsg) {
                            throw new Error(`Invalid message: ${errMsg}`);
                          }

                          // 创建消息实例并序列化
                          const deviceRegisterMsg = DeviceRegister.create(message);
                          const uint8Array = DeviceRegister.encode(deviceRegisterMsg).finish();                     

                          // 将 Uint8Array 转换为 Buffer（在浏览器环境中，mqtt.js 会处理）
                          const buffer = Buffer.from(uint8Array) as any;

                          
                          // 发布消息
                          const topic = `device/register/${deviceToken}`;
                          // 从 MQTT 客户端获取 clientId，如果不可用则使用默认值
                          const currentClientId = (mqttClient as any)?.options?.clientId || 'CupSimulator';
                          publishMQTT(topic, buffer, { qos: 1 }, async (error?: Error) => {
                            if (!error) {
                              // 标记设备已注册
                              setIsDeviceRegistered(true);
                              
                              // 添加到 Published 区域
                              setUpstreamMessages(prev => [{
                                id: `${Date.now()}-${Math.random()}`,
                                timestamp: Date.now(),
                                type: 'upstream' as const,
                                data: message,
                                clientId: currentClientId,
                                topic: topic,
                                binaryData: buffer
                              }, ...prev].slice(0, MAX_DEBUG_MESSAGES));

                              // 注册成功后，订阅 device/command/{deviceToken} topic
                              const commandTopic = `device/command/${deviceToken}`;
                              subscribeMQTT(commandTopic, (subscribeError?: Error) => {
                                if (!subscribeError) {
                                  setSubscribedTopic(commandTopic);
                                } else {
                                  console.error('Failed to subscribe:', subscribeError);
                                }
                              });
                            }
                          });
                        } catch (error) {
                          console.error('Failed to register device:', error);
                          alert(`Failed to register device: ${(error as Error).message}`);
                        }
                      }}
                      disabled={!isMQTTConnected || !deviceToken.trim() || isDeviceRegistered}
                      className={`px-6 py-2 rounded-lg transition-colors font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 active:opacity-80 ${
                        isDeviceRegistered
                          ? 'bg-gray-500/20 border border-gray-500/50 text-gray-400'
                          : 'bg-green-500/20 border border-green-500/50 text-green-200 hover:bg-green-500/30'
                      }`}
                    >
                      Register
                    </button>
                  </div>
                </div>

                {/* 设备命令 */}
                <div className="space-y-3 mt-4 pt-4 border-t border-white/10">
                  <label className="block text-sm text-white/70 mb-2">Device Commands</label>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!isMQTTConnected) {
                          alert('Please connect to MQTT broker first');
                          return;
                        }

                        if (!deviceToken.trim()) {
                          alert('Please enter device token first');
                          return;
                        }

                        try {
                          // 加载 protobuf 定义
                          const root = await protobuf.load('/device.proto');
                          const DeviceCommand = root.lookupType('com.sexToy.proto.DeviceCommand');

                          // 创建消息对象（只设置实际需要的字段）
                          const message: any = {
                            deviceToken: deviceToken,
                            commandType: 1, // COMMAND_START
                            commandData: new Uint8Array(),
                            timestamp: Date.now()
                          };
                          // command_data 是可选的，不设置时不会包含在编码中

                          // 验证消息
                          const errMsg = DeviceCommand.verify(message);
                          if (errMsg) {
                            throw new Error(`Invalid message: ${errMsg}`);
                          }

                          // 创建消息实例并序列化
                          const deviceCommandMsg = DeviceCommand.create(message);
                                                  
                          const uint8Array = DeviceCommand.encode(deviceCommandMsg).finish();
                                           
     
                          // 将 Uint8Array 转换为 Buffer
                          const buffer = Buffer.from(uint8Array) as any;
                    
                          
                          const decoded = DeviceCommand.decode(buffer) as any;
                          
                          // 发布消息
                          const topic = `device/command/${deviceToken}`;
                          // 从 MQTT 客户端获取 clientId，如果不可用则使用默认值
                          const currentClientId = (mqttClient as any)?.options?.clientId || 'CupSimulator';
                          publishMQTT(topic, buffer, { qos: 1 }, (error?: Error) => {
                            if (!error) {
                              // 添加到 Published 区域
                              setUpstreamMessages(prev => [{
                                id: `${Date.now()}-${Math.random()}`,
                                timestamp: Date.now(),
                                type: 'upstream' as const,
                                data: message,
                                clientId: currentClientId,
                                topic: topic,
                                binaryData: buffer
                              }, ...prev].slice(0, MAX_DEBUG_MESSAGES));
                            }
                          });
                        } catch (error) {
                          console.error('Failed to send start command:', error);
                          alert(`Failed to send start command: ${(error as Error).message}`);
                        }
                      }}
                      disabled={!isMQTTConnected || !deviceToken.trim()}
                      className="flex-1 px-6 py-2 bg-green-500/20 border border-green-500/50 text-green-200 rounded-lg hover:bg-green-500/30 transition-colors font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 active:opacity-80"
                    >
                      Start
                    </button>
                    <button
                      onClick={async () => {
                        if (!isMQTTConnected) {
                          alert('Please connect to MQTT broker first');
                          return;
                        }

                        if (!deviceToken.trim()) {
                          alert('Please enter device token first');
                          return;
                        }

                        try {
                          // 加载 protobuf 定义
                          const root = await protobuf.load('/device.proto');
                          const DeviceCommand = root.lookupType('com.sexToy.proto.DeviceCommand');

                          // 创建消息对象（只设置实际需要的字段）
                          const message: any = {
                            deviceToken: deviceToken,
                            commandType: 2, // COMMAND_STOP
                            commandData: new Uint8Array(),
                            timestamp: Date.now()
                          };
                          // commandData 是可选的，不设置时不会包含在编码中

                          // 验证消息
                          const errMsg = DeviceCommand.verify(message);
                          if (errMsg) {
                            throw new Error(`Invalid message: ${errMsg}`);
                          }

                          // 创建消息实例并序列化
                          const deviceCommandMsg = DeviceCommand.create(message);
                          const uint8Array = DeviceCommand.encode(deviceCommandMsg).finish();
                          // 将 Uint8Array 转换为 Buffer
                          const buffer = Buffer.from(uint8Array) as any;

                          // 发布消息
                          const topic = `device/command/${deviceToken}`;
                          // 从 MQTT 客户端获取 clientId，如果不可用则使用默认值
                          const currentClientId = (mqttClient as any)?.options?.clientId || 'CupSimulator';
                          publishMQTT(topic, buffer, { qos: 1 }, (error?: Error) => {
                            if (!error) {
                              // 添加到 Published 区域
                              setUpstreamMessages(prev => [{
                                id: `${Date.now()}-${Math.random()}`,
                                timestamp: Date.now(),
                                type: 'upstream' as const,
                                data: message,
                                clientId: currentClientId,
                                topic: topic,
                                binaryData: buffer
                              }, ...prev].slice(0, MAX_DEBUG_MESSAGES));
                            }
                          });
                        } catch (error) {
                          console.error('Failed to send stop command:', error);
                          alert(`Failed to send stop command: ${(error as Error).message}`);
                        }
                      }}
                      disabled={!isMQTTConnected || !deviceToken.trim()}
                      className="flex-1 px-6 py-2 bg-red-500/20 border border-red-500/50 text-red-200 rounded-lg hover:bg-red-500/30 transition-colors font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 active:opacity-80"
                    >
                      Stop
                    </button>
                  </div>
                </div>

                {/* 运动规划任务指令发送区 */}
                <div className="space-y-3 mt-4 pt-4 border-t border-white/10">
                  <label className="block text-sm text-white/70 mb-2">Motion Planning Task</label>
                  
                  {/* 下拉菜单 */}
                  <div>
                    <label className="block text-xs text-white/60 mb-1">Select Task</label>
                    <select
                      value={selectedTaskId}
                      onChange={(e) => setSelectedTaskId(e.target.value)}
                      disabled={!isMQTTConnected || !deviceToken.trim() || motionTasks.length === 0}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">-- Select a task --</option>
                      {motionTasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 文件上传 */}
                  <div>
                    <label className="block text-xs text-white/60 mb-1">Upload Task File</label>
                    <input
                      type="file"
                      accept=".bin"
                      onChange={handleFileUpload}
                      disabled={!isMQTTConnected || !deviceToken.trim()}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-500/20 file:text-blue-200 hover:file:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* 下发任务按钮 */}
                  <button
                    onClick={handleSendTask}
                    disabled={!isMQTTConnected || !deviceToken.trim() || !selectedTaskId}
                    className="w-full px-6 py-2 bg-purple-500/20 border border-purple-500/50 text-purple-200 rounded-lg hover:bg-purple-500/30 transition-colors font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 active:opacity-80"
                  >
                    Send Task
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 3D 可视化 - 右侧 */}
          <div className="bg-white/5 rounded-lg border border-white/10 p-6 md:p-8 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl md:text-2xl text-white font-medium">
                3D Device Visualization
              </h2>
              <button
                onClick={isRunning ? stop : start}
                disabled={false}
                className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-all whitespace-nowrap shadow-lg active:scale-95 active:opacity-80 ${
                  isRunning
                    ? 'bg-red-500/40 border-2 border-red-400 text-white hover:bg-red-500/50'
                    : 'bg-blue-500/30 border-2 border-blue-400/60 text-white hover:bg-blue-500/40'
                }`}
              >
                {isRunning ? 'stop' : 'auto run'}
              </button>
            </div>

            {/* 订阅状态显示 */}
            {subscribedTopic && (
              <div className="flex items-center gap-2 text-xs text-green-400 mb-4">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span>Subscribed: {subscribedTopic}</span>
              </div>
            )}
            
            {/* 3D场景 - 确保在最上层，可以正常拖动 */}
            <div className="w-full h-[400px] md:h-[450px] lg:h-[500px] mb-4 relative z-10">
              <RhythmCanvas frame={currentFrame} />
            </div>
            
            {/* 图表区域 - 并排显示在3D场景下方，半透明背景 */}
            <div className="grid grid-cols-2 gap-3">
              {/* Stroke 时间轴图表 */}
              <div className="h-[120px] md:h-[140px] flex flex-col bg-black/40 backdrop-blur-sm rounded-lg border border-white/10 p-1.5">
                <h3 className="text-xs text-white/80 mb-0.5 flex-shrink-0 font-medium">Stroke Timeline</h3>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <StrokeTimelineChart data={strokeHistory} />
                </div>
              </div>
              
              {/* Rotation 时间轴图表 */}
              <div className="h-[120px] md:h-[140px] flex flex-col bg-black/40 backdrop-blur-sm rounded-lg border border-white/10 p-1.5">
                <h3 className="text-xs text-white/80 mb-0.5 flex-shrink-0 font-medium">Rotation Timeline</h3>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <RotationTimelineChart data={rotationHistory} />
                </div>
              </div>
            </div>
            
            {/* 实时参数显示 - 在画布下方，与左侧控制面板对齐，始终显示 */}
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-white/50">stroke:</span>
                  <span className="text-white ml-2">
                    {Math.abs(strokeVelocity).toFixed(2)}/s
                  </span>
                </div>
                <div>
                  <span className="text-white/50">Rotation:</span>
                  <span className="text-white ml-2">
                    {rotationVelocity.toFixed(2)}/s
                  </span>
                </div>
                <div>
                  <span className="text-white/50">Suck:</span>
                  <span className="text-white ml-2">
                    {currentFrame ? currentFrame.suck.toFixed(1) : '0.5'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Debug Console - 独立显示区域 */}
        <div className="bg-white/5 rounded-lg border border-white/10 p-6 md:p-8">
          <div className="flex items-center justify-between mb-4">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Published 消息 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-white/70">Published</h4>
                <button
                  onClick={() => setUpstreamMessages([])}
                  className="text-xs text-white/50 hover:text-white/70 transition-colors"
                >
                  Clear
                </button>
              </div>
              <div className="bg-black/30 rounded-lg border border-white/10 p-3 h-[200px] overflow-y-auto space-y-2">
                {upstreamMessages.length === 0 ? (
                  <div className="text-xs text-white/30 text-center py-2">No published messages</div>
                ) : (
                  upstreamMessages.map((msg) => (
                    <div key={msg.id} className="text-xs font-mono border-b border-white/5 pb-2 last:border-0 last:pb-0">
                      <div className="text-white/50 mb-1">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </div>
                      {msg.clientId && (
                        <div className="text-white/60 mb-1">
                          Client ID: <span className="text-white/80">{msg.clientId}</span>
                        </div>
                      )}
                      {msg.topic && (
                        <div className="text-white/60 mb-1">
                          Topic: <span className="text-white/80">{msg.topic}</span>
                        </div>
                      )}
                      {msg.binaryData && (
                        <div className="mb-1">
                          <button
                            onClick={() => downloadBinary(msg.binaryData!, 'message.bin')}
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors underline"
                          >
                            Download message.bin
                          </button>
                        </div>
                      )}
                      <div className="text-green-400 break-all">
                        {renderMessageData(msg.data, 'text-green-400')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Subscribed 消息 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-white/70">Subscribed</h4>
                <button
                  onClick={() => setDownstreamMessages([])}
                  className="text-xs text-white/50 hover:text-white/70 transition-colors"
                >
                  Clear
                </button>
              </div>
              <div className="bg-black/30 rounded-lg border border-white/10 p-3 h-[200px] overflow-y-auto space-y-2">
                {downstreamMessages.length === 0 ? (
                  <div className="text-xs text-white/30 text-center py-2">No subscribed messages</div>
                ) : (
                  downstreamMessages.map((msg) => (
                    <div key={msg.id} className="text-xs font-mono border-b border-white/5 pb-2 last:border-0 last:pb-0">
                      <div className="text-white/50 mb-1">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </div>
                      {msg.topic && (
                        <div className="text-white/60 mb-1">
                          Topic: <span className="text-white/80">{msg.topic}</span>
                        </div>
                      )}
                      {msg.binaryData && (
                        <div className="mb-1">
                          <button
                            onClick={() => downloadBinary(msg.binaryData!, 'message.bin')}
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors underline"
                          >
                            Download message.bin
                          </button>
                        </div>
                      )}
                      <div className="text-blue-400 break-all">
                        {renderMessageData(msg.data, 'text-blue-400')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 运动指令日志 - 独立显示区域 */}
        <div className="bg-white/5 rounded-lg border border-white/10 p-6 md:p-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">运动指令日志</h3>
            <button
              onClick={clearMotionLogs}
              className="text-xs text-white/50 hover:text-white/70 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="bg-black/30 rounded-lg border border-white/10 p-4 h-[200px] overflow-y-auto space-y-1">
            {motionLogs.length === 0 ? (
              <div className="text-xs text-white/30 text-center py-4">No motion logs yet</div>
            ) : (
              motionLogs.map((log, index) => (
                <div key={index} className="text-xs text-white/70 font-mono border-b border-white/5 pb-2 last:border-0 last:pb-0">
                  <span className="text-white/50">
                    [{new Date(log.timestamp).toLocaleTimeString()}]
                  </span>{' '}
                  {log.message}
                </div>
              ))
            )}
          </div>
        </div>

        {/* MQTT Logs - 独立显示区域 */}
        <div className="bg-white/5 rounded-lg border border-white/10 p-6 md:p-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">MQTT Logs</h3>
            <button
              onClick={() => setMqttLogs([])}
              className="text-xs text-white/50 hover:text-white/70 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="bg-black/30 rounded-lg border border-white/10 p-4 h-[300px] overflow-y-auto space-y-1 font-mono text-sm">
            {mqttLogs.length === 0 ? (
              <div className="text-white/30 text-center py-4">No logs yet</div>
            ) : (
              mqttLogs.map((log) => {
                let textColor = 'text-green-400';
                if (log.type === 'error') textColor = 'text-red-400';
                else if (log.type === 'warning') textColor = 'text-yellow-400';
                else if (log.type === 'success') textColor = 'text-green-300';
                
                return (
                  <div key={log.id} className={`${textColor} break-all whitespace-pre-wrap`}>
                    {log.message}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
