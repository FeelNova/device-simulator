import protobuf from 'protobufjs';

const schema = protobuf.parse(`syntax = "proto3";
message Register { string device_token=1; string device_sn=2; string device_type=3; uint64 register_time=4; string esp32_version=5; }
message Heartbeat { string device_token=1; uint64 last_online_time=2; int32 battery_level=3; uint64 heartbeat_time=4; }
message DeviceCommand { string device_token=1; uint32 command_type=2; bytes command_data=3; uint64 timestamp=4; }
message HttpCommand { string firmware_url=1; string firmware_version=2; uint32 firmware_size=3; bytes firmware_md5=4; uint32 target_device=5; }
message VersionInfo { string device_token=1; string esp32_version=2; string stm32_version=3; uint64 timestamp=4; }
message OtaStatus { string device_token=1; uint32 target_device=2; int32 progress=3; string status=4; string current_version=5; string error_msg=6; uint64 timestamp=7; }
`).root;
export function encode(name: string, data: Record<string, unknown>): Uint8Array {
  const type = schema.lookupType(name);
  return type.encode(type.fromObject(data)).finish();
}
export function decodeCommand(data: Uint8Array) {
  const type = schema.lookupType('DeviceCommand');
  return type.toObject(type.decode(data), { longs: Number, bytes: Uint8Array, defaults: true }) as {
    deviceToken: string; commandType: number; commandData: Uint8Array; timestamp: number;
  };
}
export function decodeHttpCommand(data: Uint8Array) {
  const type = schema.lookupType('HttpCommand');
  return type.toObject(type.decode(data), { defaults: true }) as {
    firmwareUrl: string; firmwareVersion: string; firmwareSize: number; targetDevice: number;
  };
}
export const mockPrefix = 'PULSAR_OTA_MOCK\n';
export function createMock(hardware: string, version: string): Uint8Array {
  if (!/^sim-[A-Za-z0-9_.-]+$/.test(hardware)) throw new Error('Mock hardware must start with sim-.');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use a version such as 1.1.0.');
  const manifest = new TextEncoder().encode(mockPrefix + JSON.stringify({
    kind: 'pulsar-esp32-ota-mock-v1', device_type: hardware, version,
    warning: 'SIMULATOR ONLY. NOT EXECUTABLE ESP32 FIRMWARE.', padding: '.'.repeat(1024),
  }));
  const result = new Uint8Array(manifest.length + 1); result[0] = 0xe9; result.set(manifest, 1); return result;
}
export function validateMock(data: Uint8Array) {
  const text = new TextDecoder().decode(data.subarray(1));
  if (data[0] !== 0xe9 || !text.startsWith(mockPrefix)) throw new Error('Only simulator mock files are accepted. Real firmware will not be executed.');
  // Hardware compatibility and target version come from the server's catalog.
  // Embedded mock metadata is informational and does not constrain reuse.
}
