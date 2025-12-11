'use client';

import { useState } from 'react';
import mqtt, { MqttClient, IClientOptions } from 'mqtt';

export default function TestMqttPage() {
  const [brokerUrl, setBrokerUrl] = useState<string>('ws://www.feelnova-ai.com:8083/mqtt');
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('Nova#123');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [client, setClient] = useState<MqttClient | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [publishTopic, setPublishTopic] = useState<string>('testtopic');
  const [publishMessage, setPublishMessage] = useState<string>('hello');
  const [subscribeTopic, setSubscribeTopic] = useState<string>('');
  const [subscribedMessages, setSubscribedMessages] = useState<Array<{ topic: string; message: string; timestamp: string }>>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 50));
    console.log(`[${timestamp}] ${message}`);
  };

  const handleConnect = () => {
    if (client?.connected) {
      addLog('Already connected');
      return;
    }

    if (client) {
      client.end();
      setClient(null);
    }

    addLog(`Connecting to ${brokerUrl}...`);
    addLog(`Username: ${username}, Password: ${password ? '***' : '(empty)'}`);

    try {
      const options: IClientOptions = {
        clientId: `test_client_${Date.now()}`,
        username: username || undefined,
        password: password || undefined,
        keepalive: 60,
        clean: true,
        reconnectPeriod: 0,
        connectTimeout: 30000,
        protocolVersion: 4 as const, // MQTT 3.1.1 (类型必须是 3 | 4 | 5)
        // 移除 qos: 1，因为它不属于连接选项
      };

      const mqttClient = mqtt.connect(brokerUrl, options);
      setClient(mqttClient);

      mqttClient.on('connect', (packet) => {
        addLog(`✓ Connected successfully`);
        addLog(`Client ID: ${(mqttClient as any)?.options?.clientId || options.clientId || 'N/A'}`);
        addLog(`Return Code: ${packet.returnCode}`);
        addLog(`Session Present: ${packet.sessionPresent}`);
        setIsConnected(true);

        if (packet.returnCode !== 0) {
          const errorMessages: Record<number, string> = {
            1: 'Connection Refused: unacceptable protocol version',
            2: 'Connection Refused: identifier rejected',
            3: 'Connection Refused: server unavailable',
            4: 'Connection Refused: bad user name or password',
            5: 'Connection Refused: not authorized'
          };
          const errorMsg = errorMessages[(packet.returnCode ?? 0)] || `Unknown error (code: ${packet.returnCode})`;
          addLog(`✗ Connection rejected: ${errorMsg}`);
          setIsConnected(false);
        }
      });

      mqttClient.on('error', (error) => {
        addLog(`✗ Connection error: ${error.message}`);
        console.error('MQTT error:', error);
        setIsConnected(false);
      });

      mqttClient.on('close', () => {
        addLog('Connection closed');
        setIsConnected(false);
      });

      mqttClient.on('disconnect', (packet) => {
        addLog(`Disconnected (reason: ${packet?.reasonCode || 'unknown'})`);
        setIsConnected(false);
      });

      mqttClient.on('offline', () => {
        addLog('Client offline');
        setIsConnected(false);
      });

      // 接收订阅的消息
      mqttClient.on('message', (topic, message) => {
        const timestamp = new Date().toLocaleTimeString();
        const messageStr = message.toString();
        addLog(`📨 Received message from topic: ${topic}`);
        addLog(`   Message: ${messageStr}`);
        setSubscribedMessages(prev => [{
          topic,
          message: messageStr,
          timestamp
        }, ...prev].slice(0, 100));
      });

    } catch (error) {
      addLog(`✗ Failed to create client: ${(error as Error).message}`);
      console.error('Connection error:', error);
    }
  };

  const handleDisconnect = () => {
    if (client) {
      client.end();
      setClient(null);
      setIsConnected(false);
      addLog('Disconnected');
    }
  };

  const handlePublish = () => {
    if (!client || !client.connected) {
      addLog('✗ Not connected. Please connect first.');
      return;
    }

    if (!publishTopic.trim()) {
      addLog('✗ Topic cannot be empty');
      return;
    }

    addLog(`Publishing to topic: ${publishTopic}`);
    addLog(`Message: ${publishMessage}`);

    client.publish(publishTopic, publishMessage, { qos: 1 }, (error) => {
      if (error) {
        addLog(`✗ Failed to publish: ${error.message}`);
        console.error('Publish error:', error);
      } else {
        addLog(`✓ Message published successfully`);
      }
    });
  };

  const handleSubscribe = () => {
    if (!client || !client.connected) {
      addLog('✗ Not connected. Please connect first.');
      return;
    }

    if (!subscribeTopic.trim()) {
      addLog('✗ Subscribe topic cannot be empty');
      return;
    }

    addLog(`Subscribing to topic: ${subscribeTopic}`);

    client.subscribe(subscribeTopic, { qos: 1 }, (error, granted) => {
      if (error) {
        addLog(`✗ Failed to subscribe: ${error.message}`);
        console.error('Subscribe error:', error);
      } else {
        addLog(`✓ Subscribed to topic: ${subscribeTopic}`);
        if (granted) {
          granted.forEach((g) => {
            addLog(`   QoS: ${g.qos}`);
          });
        }
      }
    });
  };

  const handleUnsubscribe = () => {
    if (!client || !client.connected) {
      addLog('✗ Not connected. Please connect first.');
      return;
    }

    if (!subscribeTopic.trim()) {
      addLog('✗ Subscribe topic cannot be empty');
      return;
    }

    addLog(`Unsubscribing from topic: ${subscribeTopic}`);

    client.unsubscribe(subscribeTopic, (error) => {
      if (error) {
        addLog(`✗ Failed to unsubscribe: ${error.message}`);
        console.error('Unsubscribe error:', error);
      } else {
        addLog(`✓ Unsubscribed from topic: ${subscribeTopic}`);
      }
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">MQTT Connection Test</h1>

        <div className="bg-white/5 rounded-lg border border-white/10 p-6 space-y-4 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Connection Settings</h2>

          {/* Broker URL */}
          <div>
            <label className="block text-sm text-white/70 mb-2">Broker URL</label>
            <input
              type="text"
              value={brokerUrl}
              onChange={(e) => setBrokerUrl(e.target.value)}
              placeholder="ws://www.feelnova-ai.com:8083/mqtt"
              disabled={isConnected}
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
              disabled={isConnected}
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
                disabled={isConnected}
                className="w-full px-4 py-2 pr-10 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isConnected}
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

          {/* Connection Status */}
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-500'}`} />
            <span className="text-sm text-white/70">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            {!isConnected ? (
              <button
                onClick={handleConnect}
                className="px-6 py-2 bg-blue-500/20 border border-blue-500/50 text-blue-200 rounded-lg hover:bg-blue-500/30 transition-colors font-semibold"
              >
                Connect
              </button>
            ) : (
              <button
                onClick={handleDisconnect}
                className="px-6 py-2 bg-red-500/20 border border-red-500/50 text-red-200 rounded-lg hover:bg-red-500/30 transition-colors font-semibold"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>

        {/* Publish Section */}
        <div className="bg-white/5 rounded-lg border border-white/10 p-6 space-y-4 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Publish Message</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">Topic</label>
              <input
                type="text"
                value={publishTopic}
                onChange={(e) => setPublishTopic(e.target.value)}
                placeholder="testtopic"
                disabled={!isConnected}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2">Message</label>
              <input
                type="text"
                value={publishMessage}
                onChange={(e) => setPublishMessage(e.target.value)}
                placeholder="hello"
                disabled={!isConnected}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <button
            onClick={handlePublish}
            disabled={!isConnected}
            className="px-6 py-2 bg-green-500/20 border border-green-500/50 text-green-200 rounded-lg hover:bg-green-500/30 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Publish
          </button>
        </div>

        {/* Subscribe Section */}
        <div className="bg-white/5 rounded-lg border border-white/10 p-6 space-y-4 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Subscribe to Topic</h2>
          
          <div className="flex gap-3">
            <input
              type="text"
              value={subscribeTopic}
              onChange={(e) => setSubscribeTopic(e.target.value)}
              placeholder="Enter topic to subscribe"
              disabled={!isConnected}
              className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleSubscribe}
              disabled={!isConnected}
              className="px-6 py-2 bg-purple-500/20 border border-purple-500/50 text-purple-200 rounded-lg hover:bg-purple-500/30 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Subscribe
            </button>
            <button
              onClick={handleUnsubscribe}
              disabled={!isConnected}
              className="px-6 py-2 bg-orange-500/20 border border-orange-500/50 text-orange-200 rounded-lg hover:bg-orange-500/30 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Unsubscribe
            </button>
          </div>

          {/* Subscribed Messages */}
          {subscribedMessages.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-white/70">Received Messages</h3>
                <button
                  onClick={() => setSubscribedMessages([])}
                  className="text-xs text-white/50 hover:text-white/70 transition-colors"
                >
                  Clear
                </button>
              </div>
              <div className="bg-black/30 rounded-lg border border-white/10 p-4 max-h-[200px] overflow-y-auto space-y-2">
                {subscribedMessages.map((msg, index) => (
                  <div key={index} className="text-xs font-mono border-b border-white/5 pb-2 last:border-0 last:pb-0">
                    <div className="text-white/50 mb-1">
                      [{msg.timestamp}] Topic: {msg.topic}
                    </div>
                    <div className="text-cyan-400 break-all whitespace-pre-wrap">
                      {msg.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Logs */}
        <div className="bg-white/5 rounded-lg border border-white/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Logs</h2>
            <button
              onClick={() => setLogs([])}
              className="text-xs text-white/50 hover:text-white/70 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="bg-black/30 rounded-lg border border-white/10 p-4 max-h-[400px] overflow-y-auto space-y-1 font-mono text-sm">
            {logs.length === 0 ? (
              <div className="text-white/30 text-center py-4">No logs yet</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="text-green-400 break-all whitespace-pre-wrap">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

