/**
 * MQTT Hook
 * 管理 MQTT over WebSocket 连接
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import mqtt, { MqttClient, IClientOptions } from 'mqtt';

export interface MQTTLog {
  id: string;
  timestamp: string;
  message: string;
  type?: 'info' | 'success' | 'error' | 'warning';
}

interface UseMQTTOptions {
  url?: string;
  username?: string;
  password?: string;
  clientId?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onLog?: (log: MQTTLog) => void;
  onMessage?: (topic: string, message: Buffer) => void;
}

export function useMQTT(options: UseMQTTOptions = {}) {
  const {
    url = 'wss://www.feelnova-ai.com/mqtt/',
    username = 'admin',
    password = 'Nova#123',
    clientId = 'CupSimulator',
    onConnect,
    onDisconnect,
    onError,
    onLog,
    onMessage
  } = options;

  const addLog = useCallback((message: string, type: MQTTLog['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const log: MQTTLog = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp,
      message,
      type
    };
    onLog?.(log);
  }, [onLog]);

  const [isConnected, setIsConnected] = useState(false);
  const [subscribedTopics, setSubscribedTopics] = useState<Set<string>>(new Set());
  const clientRef = useRef<MqttClient | null>(null);

  const connect = useCallback(() => {
    // 如果已经连接，先断开
    if (clientRef.current?.connected) {
      addLog('Already connected', 'warning');
      return;
    }

    addLog(`Connecting to ${url}...`, 'info');
    addLog(`Username: ${username}, Password: ${password ? '***' : '(empty)'}`, 'info');

    try {
      const connectOptions: IClientOptions = {
        clientId,
        username,
        password,
        keepalive: 60,
        clean: true,
        reconnectPeriod: 0, // 禁用自动重连，手动控制
        connectTimeout: 30000, // 30秒连接超时
      };

      const client = mqtt.connect(url, connectOptions);
      clientRef.current = client;

      client.on('connect', (packet) => {
        addLog('✓ Connected successfully', 'success');
        // IConnackPacket does not have clientId, so just log the provided clientId
        addLog(`Client ID: ${clientId}`, 'info');
        addLog(`Return Code: ${packet.returnCode}`, 'info');
        addLog(`Session Present: ${packet.sessionPresent}`, 'info');
        setIsConnected(true);
        onConnect?.();

        if (packet.returnCode !== 0 && packet.returnCode !== undefined) {
          const errorMessages: Record<number, string> = {
            1: 'Connection Refused: unacceptable protocol version',
            2: 'Connection Refused: identifier rejected',
            3: 'Connection Refused: server unavailable',
            4: 'Connection Refused: bad user name or password',
            5: 'Connection Refused: not authorized'
          };
          const returnCode = packet.returnCode;
          const errorMsg = errorMessages[returnCode] || `Unknown error (code: ${returnCode})`;
          addLog(`✗ Connection rejected: ${errorMsg}`, 'error');
          setIsConnected(false);
        }
      });

      client.on('disconnect', (packet) => {
        addLog(`Disconnected (reason: ${packet?.reasonCode || 'unknown'})`, 'info');
        setIsConnected(false);
        onDisconnect?.();
      });

      client.on('close', () => {
        addLog('Connection closed', 'info');
        setIsConnected(false);
        onDisconnect?.();
      });

      client.on('error', (error) => {
        const errorMsg = error.message || 'Unknown error';
        addLog(`✗ Connection error: ${errorMsg}`, 'error');
        console.error('MQTT error:', error);
        setIsConnected(false);
        onError?.(error);
      });

      client.on('offline', () => {
        addLog('Client offline', 'warning');
        setIsConnected(false);
        onDisconnect?.();
      });

      // 监听消息
      client.on('message', (topic, message) => {
        addLog(`📨 Received message from topic: ${topic}`, 'info');
        // 调用 onMessage 回调，传递原始 Buffer 数据
        onMessage?.(topic, message);
        // 保留日志记录（对于文本消息）
        try {
          const messageStr = message.toString();
          addLog(`   Message: ${messageStr.substring(0, 100)}${messageStr.length > 100 ? '...' : ''}`, 'info');
        } catch (e) {
          addLog(`   Message: [Binary data, ${message.length} bytes]`, 'info');
        }
      });
    } catch (error) {
      const errorMsg = (error as Error).message || 'Failed to create MQTT client';
      addLog(`✗ Failed to create client: ${errorMsg}`, 'error');
      console.error('Failed to create MQTT client:', error);
      setIsConnected(false);
      onError?.(error as Error);
    }
  }, [url, username, password, clientId, onConnect, onDisconnect, onError, addLog]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      try {
        addLog('Disconnecting...', 'info');
        clientRef.current.end(true); // true 表示强制断开
        clientRef.current = null;
        setIsConnected(false);
        addLog('Disconnected', 'info');
        onDisconnect?.();
      } catch (error) {
        const errorMsg = (error as Error).message || 'Error disconnecting';
        addLog(`✗ Error disconnecting: ${errorMsg}`, 'error');
        console.error('Error disconnecting MQTT:', error);
      }
    } else {
      addLog('Not connected', 'warning');
    }
  }, [onDisconnect, addLog]);

  // 清理函数
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.end(true);
        clientRef.current = null;
      }
    };
  }, []);

  const publish = useCallback((topic: string, message: Buffer | string, options?: { qos?: 0 | 1 | 2; retain?: boolean }, callback?: (error?: Error) => void) => {
    if (!clientRef.current || !clientRef.current.connected) {
      const error = new Error('MQTT client not connected');
      addLog('✗ Cannot publish: Not connected', 'error');
      callback?.(error);
      return;
    }

    try {
      addLog(`Publishing to topic: ${topic}`, 'info');
      clientRef.current.publish(topic, message, options || { qos: 1 }, (error) => {
        if (error) {
          addLog(`✗ Failed to publish: ${error.message}`, 'error');
          callback?.(error);
        } else {
          addLog(`✓ Message published successfully`, 'success');
          callback?.();
        }
      });
    } catch (error) {
      const errorMsg = (error as Error).message || 'Failed to publish';
      addLog(`✗ Failed to publish: ${errorMsg}`, 'error');
      callback?.(error as Error);
    }
  }, [addLog]);

  const subscribe = useCallback((topic: string, callback?: (error?: Error) => void) => {
    if (!clientRef.current || !clientRef.current.connected) {
      const error = new Error('MQTT client not connected');
      addLog('✗ Cannot subscribe: Not connected', 'error');
      callback?.(error);
      return;
    }

    if (subscribedTopics.has(topic)) {
      addLog(`Already subscribed to topic: ${topic}`, 'warning');
      callback?.();
      return;
    }

    try {
      addLog(`Subscribing to topic: ${topic}`, 'info');
      clientRef.current.subscribe(topic, { qos: 1 }, (error, granted) => {
        if (error) {
          addLog(`✗ Failed to subscribe: ${error.message}`, 'error');
          callback?.(error);
        } else {
          addLog(`✓ Subscribed to topic: ${topic}`, 'success');
          if (granted) {
            granted.forEach((g) => {
              addLog(`   QoS: ${g.qos}`, 'info');
            });
          }
          setSubscribedTopics(prev => new Set(prev).add(topic));
          callback?.();
        }
      });
    } catch (error) {
      const errorMsg = (error as Error).message || 'Failed to subscribe';
      addLog(`✗ Failed to subscribe: ${errorMsg}`, 'error');
      callback?.(error as Error);
    }
  }, [addLog, subscribedTopics]);

  const unsubscribe = useCallback((topic: string, callback?: (error?: Error) => void) => {
    if (!clientRef.current || !clientRef.current.connected) {
      const error = new Error('MQTT client not connected');
      addLog('✗ Cannot unsubscribe: Not connected', 'error');
      callback?.(error);
      return;
    }

    if (!subscribedTopics.has(topic)) {
      addLog(`Not subscribed to topic: ${topic}`, 'warning');
      callback?.();
      return;
    }

    try {
      addLog(`Unsubscribing from topic: ${topic}`, 'info');
      clientRef.current.unsubscribe(topic, (error) => {
        if (error) {
          addLog(`✗ Failed to unsubscribe: ${error.message}`, 'error');
          callback?.(error);
        } else {
          addLog(`✓ Unsubscribed from topic: ${topic}`, 'success');
          setSubscribedTopics(prev => {
            const newSet = new Set(prev);
            newSet.delete(topic);
            return newSet;
          });
          callback?.();
        }
      });
    } catch (error) {
      const errorMsg = (error as Error).message || 'Failed to unsubscribe';
      addLog(`✗ Failed to unsubscribe: ${errorMsg}`, 'error');
      callback?.(error as Error);
    }
  }, [addLog, subscribedTopics]);

  // 断开连接时清除订阅状态
  useEffect(() => {
    if (!isConnected) {
      setSubscribedTopics(new Set());
    }
  }, [isConnected]);

  return {
    isConnected,
    connect,
    disconnect,
    publish,
    subscribe,
    unsubscribe,
    subscribedTopics: Array.from(subscribedTopics),
    client: clientRef.current
  };
}

