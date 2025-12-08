/**
 * WebSocket Hook
 * 管理 WebSocket 连接，接收节奏数据
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { RhythmFrame } from '@/lib/rhythm/mockGenerator';
import { normalizeFrame } from '@/lib/rhythm/normalizeFrame';

interface UseWebSocketOptions {
  url?: string;
  enabled?: boolean;
  onMessage?: (frame: RhythmFrame) => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    url,
    enabled = true,
    onMessage,
    onError,
    onConnect,
    onDisconnect
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastFrame, setLastFrame] = useState<RhythmFrame | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000; // 3秒

  const connect = useCallback(() => {
    if (!url || !enabled) {
      return;
    }

    // 如果已经连接，先关闭
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const frame = normalizeFrame(data);
          setLastFrame(frame);
          onMessage?.(frame);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
          onError?.(error as Error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
        onError?.(new Error('WebSocket connection error'));
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        onDisconnect?.();

        // 自动重连
        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Reconnecting... (attempt ${reconnectAttemptsRef.current})`);
            connect();
          }, reconnectDelay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          console.warn('Max reconnection attempts reached');
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      onError?.(error as Error);
    }
  }, [url, enabled, onMessage, onError, onConnect, onDisconnect]);

  const disconnect = useCallback(() => {
    // 清理重连定时器
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // 重置重连尝试次数
    reconnectAttemptsRef.current = 0;

    // 关闭 WebSocket 连接
    if (wsRef.current) {
      // 移除所有事件监听器，避免内存泄漏
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      
      // 如果连接还在，先关闭
      if (wsRef.current.readyState === WebSocket.OPEN || 
          wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }

    setIsConnected(false);
    setLastFrame(null);
  }, []);

  useEffect(() => {
    if (enabled && url) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, url, connect, disconnect]);

  return {
    isConnected,
    lastFrame,
    connect,
    disconnect
  };
}

