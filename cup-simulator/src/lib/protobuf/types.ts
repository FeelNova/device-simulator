/**
 * MQTT Protobuf消息的TypeScript类型定义
 */

// 指令类型枚举
export enum CommandType {
  UNSPECIFIED = 0,  // 未指定
  START = 1,        // 开始运行
  STOP = 2,         // 停止运行
  TASK = 3,         // 详细任务指令（需解析 command_data）
}

// 设备注册消息
export interface DeviceRegister {
  device_token: string;
  device_sn: string;
  device_type: string;
  register_time: number; // Unix时间戳（毫秒）
}

// 设备心跳消息
export interface DeviceHeartbeat {
  device_token: string;
  last_online_time: number; // Unix时间戳（毫秒）
  battery_level: number; // 0-100
  heartbeat_time: number; // Unix时间戳（毫秒）
}

// 设备指令消息
export interface DeviceCommand {
  device_token: string;
  command_type: CommandType; // 指令类型枚举
  command_data?: Uint8Array; // 二进制数据（DeviceMotionMessage 序列化后的数据）
  timestamp: number; // Unix时间戳（毫秒）
}

// DeviceMotionMessage 相关类型定义
export interface DeviceMotionMessage {
  body?: {
    config?: ConfigMessage;
    session?: SessionMessage;
    control?: ControlMessage;
  };
}

export interface Movement {
  direction: number; // 0=向下, 1=向上
  distance: number; // 运动距离占最大单向行程的比率
  duration: number; // 本次运动时间
  rotation: number; // 旋转距离（圈数）
  rotation_direction: number; // 0=顺时针, 1=逆时针
}

export interface Primitive {
  primitive_id: string;
  movements: Movement[];
}

export interface ConfigMessage {
  primitives: Primitive[];
}

export interface Unit {
  primitive_id: string;
  iteration: number; // 重复次数
  intensity: number; // 加速或减速系数
}

export interface SessionMessage {
  units: Unit[];
}

export interface ControlMessage {
  command: number; // 0=UNSPECIFIED, 1=RESET, 2=PAUSE, 3=RESUME, 4=SET_INTENSITY
  intensity?: number; // 仅在 COMMAND_SET_INTENSITY 时使用
  duration?: number; // 仅在 COMMAND_SET_INTENSITY 时使用
}

// 命令数据类型（已实现真实解析）
export interface CommandData {
  type: 'config' | 'session' | 'control';
  data: ConfigMessage | SessionMessage | ControlMessage;
}

