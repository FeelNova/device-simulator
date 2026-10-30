'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import BrokerPresets from '@/components/BrokerPresets';
import mqtt, { MqttClient } from 'mqtt';
import { Buffer } from 'buffer';
import { createMock, validateMock, releaseVersionPattern, encode, decodeCommand, decodeHttpCommand } from '@/lib/ota/protocol';

type Identity = { token: string; hardware: string; version: string };
const input = 'w-full rounded-lg border border-white/20 bg-white/5 p-3 text-white disabled:opacity-50';
const button = 'rounded-lg border border-white/20 px-5 py-3 text-sm hover:bg-white/10 disabled:opacity-40';

export default function OtaSimulator() {
  const [identity, setIdentity] = useState<Identity>({ token: '', hardware: 'sim-esp32', version: '1.0.0' });
  const [broker, setBroker] = useState(process.env.NEXT_PUBLIC_MQTT_WS_URL || '');
  const [username, setUsername] = useState(process.env.NEXT_PUBLIC_MQTT_USERNAME || ''); const [password, setPassword] = useState('');
  const [target, setTarget] = useState('1.1.0');
  const [connected, setConnected] = useState(false); const [connecting, setConnecting] = useState(false);
  const [updating, setUpdating] = useState(false); const [stage, setStage] = useState('Disconnected');
  const [seconds, setSeconds] = useState(30);
  const [logs, setLogs] = useState<string[]>([]);
  const clientRef = useRef<MqttClient | null>(null); const identityRef = useRef(identity);
  const busy = useRef(false); const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const controller = useRef<AbortController | null>(null); const reboot = useRef<ReturnType<typeof setTimeout> | null>(null);
  const simulation = useRef({ seconds }); const mounted = useRef(true);
  useEffect(() => { identityRef.current = identity; }, [identity]);
  useEffect(() => { simulation.current = { seconds }; }, [seconds]);
  useEffect(() => {
    mounted.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem('otaSimulatorIdentity') || 'null') as Identity | null;
      if (saved?.token?.startsWith('sim-') && saved.hardware?.startsWith('sim-')) { identityRef.current = saved; setIdentity(saved); }
    } catch { /* Ignore invalid local test state. Never persist MQTT credentials. */ }
    return () => {
      mounted.current = false; controller.current?.abort();
      if (heartbeat.current) clearInterval(heartbeat.current);
      if (reboot.current) clearTimeout(reboot.current);
      clientRef.current?.end(true);
    };
  }, []);
  const log = (message: string) => { if (mounted.current) setLogs(items => [`${new Date().toLocaleTimeString()}  ${message}`, ...items].slice(0, 80)); };
  const saveIdentity = (value: Identity) => { identityRef.current = value; setIdentity(value); localStorage.setItem('otaSimulatorIdentity', JSON.stringify(value)); };
  const publish = (type: string, topic: string, value: Record<string, unknown>) => new Promise<void>((resolve, reject) => {
    const client = clientRef.current;
    if (!client?.connected) { reject(new Error('MQTT is not connected.')); return; }
    client.publish(topic, Buffer.from(encode(type, value)), { qos: 1, retain: false }, error => error ? reject(error) : resolve());
  });
  const register = () => {
    const value = identityRef.current;
    return publish('Register', `device/register/${value.token}`, { deviceToken: value.token, deviceSn: value.token,
      deviceType: value.hardware, registerTime: Date.now(), esp32Version: value.version });
  };
  const sendHeartbeat = () => {
    const value = identityRef.current;
    return publish('Heartbeat', `device/heartbeat/${value.token}`, { deviceToken: value.token,
      lastOnlineTime: Date.now(), batteryLevel: 100, heartbeatTime: Date.now() });
  };
  const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error('Simulation canceled.')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
  });
  const performUpgrade = async (data: Uint8Array) => {
    if (busy.current) { log('Duplicate upgrade command ignored while updating.'); return; }
    busy.current = true; setUpdating(true); controller.current = new AbortController();
    const signal = controller.current.signal; const options = simulation.current;
    try {
      const command = decodeHttpCommand(data);
      if (command.targetDevice !== 0) throw new Error('Only ESP32 is supported.');
      log(`OTA received: target ${command.firmwareVersion}, ${command.firmwareSize} bytes.`);
      setStage('Downloading mock firmware');
      const response = await fetch('/api/ota/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: command.firmwareUrl }), signal });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Download failed.'); }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== command.firmwareSize) throw new Error('Downloaded size does not match the OTA command.');
      validateMock(bytes);
      log(`Actually downloaded and validated ${bytes.length} mock bytes.`);
      setStage('Simulating installation');
      await wait(options.seconds * 1000, signal);
      setStage('Simulating reboot');
      saveIdentity({ ...identityRef.current, version: command.firmwareVersion });
      if (heartbeat.current) clearInterval(heartbeat.current);
      clientRef.current?.end(false, {}, () => {
        reboot.current = setTimeout(() => { if (mounted.current) clientRef.current?.reconnect(); }, 2000);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Simulation failed.';
      log(message); setStage('Upgrade failed; current version preserved');
      busy.current = false; setUpdating(false);
    }
  };
  const connect = () => {
    const value = identityRef.current;
    if (!/^sim-[A-Za-z0-9_.-]+$/.test(value.token) || !/^sim-[A-Za-z0-9_.-]+$/.test(value.hardware)) { log('Use sim- prefixes for both token and hardware. Never reuse a real device identity.'); return; }
    if (!releaseVersionPattern.test(value.version) || !/^wss?:\/\//.test(broker)) { log('Enter an MQTT WebSocket URL and a version such as 1.0.0 or 1.0.0+20261030120000.'); return; }
    saveIdentity(value); setConnecting(true); setStage('Connecting');
    const client = mqtt.connect(broker, { username: username || undefined, password: password || undefined,
      clientId: `ota-${crypto.randomUUID()}`, clean: true, reconnectPeriod: 0, connectTimeout: 15000,
      will: { topic: `device/simulator_offline/${value.token}`, payload: Buffer.from(value.token), qos: 1, retain: false } });
    clientRef.current = client;
    client.on('connect', () => {
      setConnecting(false); setConnected(true);
      client.subscribe(`device/command/${identityRef.current.token}`, { qos: 1 }, async error => {
        if (error) { log(error.message); return; }
        try {
          await register(); await sendHeartbeat();
          if (heartbeat.current) clearInterval(heartbeat.current);
          heartbeat.current = setInterval(() => void sendHeartbeat().catch(error => log(error.message)), 15000);
          setStage('Registered and online'); log(`Registered ${identityRef.current.hardware}, firmware ${identityRef.current.version}.`);
          if (busy.current) { busy.current = false; setUpdating(false); log('Reboot completed. Reconnect in the application to verify the reported version.'); }
        } catch (error) { log(error instanceof Error ? error.message : 'Registration failed.'); }
      });
    });
    client.on('message', (topic, payload, packet) => {
      if (packet.retain || topic !== `device/command/${identityRef.current.token}`) return;
      try {
        const command = decodeCommand(payload);
        if (command.deviceToken !== identityRef.current.token) return;
        if (command.commandType === 13) void performUpgrade(command.commandData);
        else log(`Ignored non-OTA command ${command.commandType}; this page simulates OTA only.`);
      } catch (error) { log(error instanceof Error ? error.message : 'Invalid command.'); }
    });
    client.on('close', () => { setConnected(false); setConnecting(false); if (heartbeat.current) clearInterval(heartbeat.current); if (!busy.current) setStage('Disconnected'); });
    client.on('error', error => { setConnecting(false); log(error.message); });
  };
  const disconnect = () => {
    controller.current?.abort(); if (reboot.current) clearTimeout(reboot.current);
    if (heartbeat.current) clearInterval(heartbeat.current);
    const client = clientRef.current;
    if (client?.connected) {
      const token = identityRef.current.token;
      client.publish(`device/simulator_offline/${token}`, Buffer.from(token), { qos: 1, retain: false }, () => client.end(true));
    } else client?.end(true);
    busy.current = false; setUpdating(false); setConnected(false); setConnecting(false); setStage('Disconnected');
  };
  const downloadMock = () => {
    try {
      const bytes = createMock(identity.hardware, target);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `MOCK-${identity.hardware}-${target}.bin`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); log('Mock file generated. Upload it to firmware management with the desired hardware and target version, then publish. The mock file can be reused across test versions.');
    } catch (error) { log(error instanceof Error ? error.message : 'Could not generate mock file.'); }
  };
  const locked = connected || connecting || updating;
  return <main className='min-h-screen bg-[#10131b] px-6 py-10 text-white'>
    <div className='mx-auto max-w-5xl space-y-8'>
      <Link href='/' className='text-white/60'>← Motion simulator</Link>
      <header><p className='text-xs tracking-widest text-white/50'>ESP32 / TEST DEVICES ONLY</p><h1 className='mt-3 text-3xl font-semibold'>OTA simulator</h1>
        <p className='mt-3 max-w-3xl leading-7 text-white/60'>Generate a mock file, publish it for a sim- hardware type, and connect the same simulated device in the application. Downloads are real; installation and reboot are simulated. Keep this page open during the test.</p></header>
      <section className='rounded-xl border border-amber-300/30 bg-amber-300/5 p-5 text-sm text-amber-100'>Never upload mock images for real hardware or reuse a real device token. This page accepts only sim- identities and marked mock files.</section>
      <section className='grid gap-5 md:grid-cols-2'>
        <label className='space-y-2'><span>MQTT WebSocket URL</span><BrokerPresets value={broker} disabled={locked} onSelect={setBroker} /><input className={input} value={broker} disabled={locked} placeholder='Enter the same broker URL used by the motion simulator' onChange={e => setBroker(e.target.value)} /></label>
        <label className='space-y-2'><span>Device token (sim- prefix)</span><div className='flex gap-2'><input className={input} placeholder='Enter your own sim- test token' value={identity.token} disabled={locked} onChange={e => setIdentity({ ...identity, token: e.target.value })} /><button className={button} disabled={locked} onClick={() => saveIdentity({ ...identity, token: `sim-${crypto.randomUUID().slice(0, 12)}` })}>Generate (optional)</button></div><p className="text-xs text-white/60">You can enter any unique sim- test string. Generate is optional. Use the same token in the application.</p></label>
        <label className='space-y-2'><span>MQTT username</span><input className={input} value={username} disabled={locked} autoComplete='off' onChange={e => setUsername(e.target.value)} /></label>
        <label className='space-y-2'><span>MQTT password</span><input className={input} value={password} type='password' disabled={locked} autoComplete='off' onChange={e => setPassword(e.target.value)} /></label>
        <label className='space-y-2'><span>Hardware type / device_type</span><input className={input} value={identity.hardware} disabled={locked} onChange={e => setIdentity({ ...identity, hardware: e.target.value })} /></label>
        <label className='space-y-2'><span>Current ESP32 firmware version</span><input className={input} value={identity.version} disabled={locked} onChange={e => setIdentity({ ...identity, version: e.target.value })} /></label>
      </section>
      <div className='flex flex-wrap items-center gap-4'><button className={`${button} bg-blue-500/20`} disabled={locked} onClick={connect}>{connecting ? 'Connecting…' : 'Connect & register'}</button><button className={button} onClick={disconnect}>Disconnect</button><strong>{stage}</strong></div>
      <section className='border-t border-white/15 pt-7'><h2 className='text-xl'>Mock firmware</h2><div className='mt-5 grid gap-5 md:grid-cols-2'>
        <label className='space-y-2'><span>Mock target version</span><input className={input} value={target} onChange={e => setTarget(e.target.value)} /></label>
        <label className='space-y-2'><span>Installation time (5–300 seconds)</span><input className={input} type='number' min={5} max={300} value={seconds} disabled={updating} onChange={e => setSeconds(Math.min(300, Math.max(5, Number(e.target.value) || 5)))} /></label>
      </div><button className={`${button} mt-5`} onClick={downloadMock}>Download marked mock .bin</button>
      <ol className='mt-5 list-inside list-decimal space-y-2 text-sm leading-6 text-white/60'><li>Generate the mock file. In firmware management, upload it using the desired sim- hardware type and target version, then publish. Mock files can be reused across test versions.</li><li>Connect & register this simulator with an older current version.</li><li>In the application, connect using the same device token. The update page should open automatically.</li><li>Click Upgrade in the application. This simulator downloads the mock file, waits, reconnects and registers its updated version.</li><li>Return home in the application and reconnect to verify. Only the version reported on registration determines the application result. No upgrade progress/status messages are sent.</li></ol></section>
      <section className='border-t border-white/15 pt-7'><h2 className='text-xl'>OTA log</h2><pre className='mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-4 text-xs leading-6 text-white/70' aria-live='polite'>{logs.join('\n') || 'Waiting for test actions…'}</pre></section>
    </div>
  </main>;
}
