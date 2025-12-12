/**
 * Protobuf 解码工具
 * 用于将 Protobuf 二进制数据解码为 TypeScript 对象
 */

import protobuf from 'protobufjs';
import { DeviceCommand, DeviceMotionMessage, ConfigMessage, SessionMessage, ControlMessage, CommandType } from './types';
import { RhythmFrame } from '@/lib/rhythm/mockGenerator';

let root: protobuf.Root | null = null;
let DeviceCommandType: protobuf.Type | null = null;
let DeviceMotionMessageType: protobuf.Type | null = null;

// 存储配置的 primitives（用于解析 SessionMessage）
let primitivesCache: Map<string, { movements: any[] }> = new Map();

/**
 * 初始化 protobuf schema
 * 加载 device.proto 文件并编译
 */
export async function initProtobuf(): Promise<void> {
  if (root && DeviceCommandType && DeviceMotionMessageType) {
    return; // 已经初始化
  }

  try {
    // 使用内联 schema（因为浏览器环境无法直接读取文件）
    const combinedProto = `
      syntax = "proto3";
      
      package com.sexToy.proto;
      
      enum CommandType {
        COMMAND_UNSPECIFIED = 0;
        COMMAND_START = 1;
        COMMAND_STOP = 2;
        COMMAND_TASK = 3;
      }
      
      message DeviceCommand {
        string device_token = 1;
        CommandType command_type = 2;
        bytes command_data = 3;
        uint64 timestamp = 4;
      }
    `;

    const deviceMotionProto = `
      message DeviceMotionMessage {
        oneof body {
          ConfigMessage config = 1;
          SessionMessage session = 2;
          ControlMessage control = 3;
        }
      }
      
      message Movement {
        enum Direction {
          DIRECTION_DOWN = 0;
          DIRECTION_UP = 1;
        }
        
        enum RotationDirection {
          ROT_DIR_CLOCKWISE = 0;
          ROT_DIR_COUNTER_CLOCKWISE = 1;
        }
        
        Direction direction = 1;
        float distance = 2;
        float duration = 3;
        float rotation = 4;
        RotationDirection rotation_direction = 5;
      }
      
      message Primitive {
        string primitive_id = 1;
        repeated Movement movements = 2;
      }
      
      message ConfigMessage {
        repeated Primitive primitives = 1;
      }
      
      message Unit {
        string primitive_id = 1;
        int32 iteration = 2;
        float intensity = 3;
      }
      
      message SessionMessage {
        repeated Unit units = 1;
      }
      
      message ControlMessage {
        enum Command {
          COMMAND_UNSPECIFIED = 0;
          COMMAND_RESET = 1;
          COMMAND_PAUSE = 2;
          COMMAND_RESUME = 3;
          COMMAND_SET_INTENSITY = 4;
        }
        
        Command command = 1;
        float intensity = 2;
        float duration = 3;
      }
    `;

    // 合并两个 proto 字符串（deviceMotionProto 已经移除了 package 声明）
    const mergedProto = combinedProto + '\n' + deviceMotionProto;
    
    root = protobuf.parse(mergedProto).root;
    DeviceCommandType = root.lookupType('com.sexToy.proto.DeviceCommand');
    DeviceMotionMessageType = root.lookupType('com.sexToy.proto.DeviceMotionMessage');
  } catch (error) {
    console.error('Failed to load protobuf schema:', error);
    throw error;
  }
}

/**
 * 解码 DeviceCommand 消息
 * @param buffer Protobuf 二进制数据
 * @returns 解码后的设备指令消息
 */
export async function decodeDeviceCommand(buffer: Buffer | Uint8Array): Promise<DeviceCommand> {
  await initProtobuf();
  
  if (!DeviceCommandType) {
    throw new Error('Protobuf schema not initialized');
  }

  try {
    // 解码消息
    const message = DeviceCommandType.decode(buffer);
    
    // 转换为普通对象
    const decoded = DeviceCommandType.toObject(message, {
      longs: String,
      enums: Number, // 枚举值转换为数字
      bytes: Uint8Array,
      defaults: true,
      arrays: true,
      objects: true,
      oneofs: true
    });

    // 将枚举值转换为 CommandType（兼容字符串和数字）
    let commandType: CommandType;
    if (typeof decoded.command_type === 'number') {
      commandType = decoded.command_type as CommandType;
    } else if (typeof decoded.command_type === 'string') {
      // 兼容旧版本字符串格式
      const typeMap: Record<string, CommandType> = {
        'start': CommandType.START,
        'stop': CommandType.STOP,
        'vibrate': CommandType.TASK,
        'set_mode': CommandType.TASK,
        'set_intensity': CommandType.TASK,
        'COMMAND_START': CommandType.START,
        'COMMAND_STOP': CommandType.STOP,
        'COMMAND_TASK': CommandType.TASK,
        'COMMAND_UNSPECIFIED': CommandType.UNSPECIFIED,
      };
      commandType = typeMap[decoded.command_type] || CommandType.UNSPECIFIED;
    } else {
      commandType = CommandType.UNSPECIFIED;
    }

    return {
      device_token: decoded.device_token || '',
      command_type: commandType,
      command_data: decoded.command_data,
      timestamp: decoded.timestamp || Date.now()
    };
  } catch (error) {
    console.error('Failed to decode DeviceCommand:', error);
    throw error;
  }
}

/**
 * 解码 DeviceMotionMessage
 * @param buffer command_data 二进制数据
 * @returns 解码后的 DeviceMotionMessage
 */
export async function decodeDeviceMotionMessage(buffer: Uint8Array): Promise<DeviceMotionMessage> {
  await initProtobuf();
  
  if (!DeviceMotionMessageType) {
    throw new Error('Protobuf schema not initialized');
  }

  try {
    // 解码消息
    const message = DeviceMotionMessageType.decode(buffer);
    
    // 转换为普通对象
    const decoded = DeviceMotionMessageType.toObject(message, {
      longs: String,
      enums: String,
      bytes: Uint8Array,
      defaults: true,
      arrays: true,
      objects: true,
      oneofs: true
    });

    return decoded as DeviceMotionMessage;
  } catch (error) {
    console.error('Failed to decode DeviceMotionMessage:', error);
    throw error;
  }
}

/**
 * 处理 ConfigMessage：缓存 primitives 配置
 */
function handleConfigMessage(config: ConfigMessage): void {
  if (!config.primitives) return;
  
  primitivesCache.clear();
  config.primitives.forEach(primitive => {
    if (primitive.primitive_id) {
      primitivesCache.set(primitive.primitive_id, {
        movements: primitive.movements || []
      });
    }
  });
  
  console.log('ConfigMessage received, cached primitives:', Array.from(primitivesCache.keys()));
}

/**
 * 处理 SessionMessage：根据 units 生成运动数据
 * @param session SessionMessage
 * @returns RhythmFrame 数据
 */
function handleSessionMessage(session: SessionMessage): RhythmFrame {
  const now = Date.now();
  
  if (!session.units || session.units.length === 0) {
    // 如果没有 units，返回默认值
    return {
      t: now,
      stroke: 0.5,
      rotation: 0,
      intensity: 0.5,
      suck: 0.5,
      mode: 'session'
    };
  }

  // 取第一个 unit 作为当前运动（简化处理）
  const unit = session.units[0];
  const intensity = unit.intensity || 1.0;
  
  // 查找对应的 primitive
  const primitive = primitivesCache.get(unit.primitive_id);
  
  if (primitive && primitive.movements && primitive.movements.length > 0) {
    // 取第一个 movement 作为当前运动（简化处理）
    const movement = primitive.movements[0];
    
    // 计算 stroke（基于 direction 和 distance）
    // direction: 0=向下, 1=向上
    // distance: 0-1 之间的比率
    const stroke = movement.direction === 1 ? movement.distance : 1 - movement.distance;
    
    // 计算 rotation（基于 rotation 和 rotation_direction）
    // rotation: 圈数
    // rotation_direction: 0=顺时针, 1=逆时针
    const rotation = movement.rotation_direction === 0 
      ? movement.rotation 
      : -movement.rotation;
    
    // suck 暂时使用默认值（0.5）
    const suck = 0.5;
    
    return {
      t: now,
      stroke: Math.max(0, Math.min(1, stroke)),
      rotation: Math.max(-1, Math.min(1, rotation)),
      intensity: Math.max(0, Math.min(1, intensity)),
      suck,
      mode: `session_${unit.primitive_id}`
    };
  }
  
  // 如果没有找到对应的 primitive，使用 intensity 生成简单数据
  return {
    t: now,
    stroke: 0.5,
    rotation: 0,
    intensity: Math.max(0, Math.min(1, intensity)),
    suck: 0.5,
    mode: `session_${unit.primitive_id || 'unknown'}`
  };
}

/**
 * 检查 command_data 是否是 ControlMessage 且是暂停命令
 * @param commandData command_data 二进制数据
 * @returns 如果是暂停命令返回 true，否则返回 false
 */
export async function isPauseCommand(commandData?: Uint8Array): Promise<boolean> {
  if (!commandData || commandData.length === 0) {
    return false;
  }

  try {
    const motionMessage = await decodeDeviceMotionMessage(commandData);
    if (motionMessage.body?.control) {
      return motionMessage.body.control.command === 2; // COMMAND_PAUSE
    }
  } catch (error) {
    // 解析失败，不是暂停命令
  }
  
  return false;
}

/**
 * 检查 command_data 是否是 ControlMessage 且是继续命令
 * @param commandData command_data 二进制数据
 * @returns 如果是继续命令返回 true，否则返回 false
 */
export async function isResumeCommand(commandData?: Uint8Array): Promise<boolean> {
  if (!commandData || commandData.length === 0) {
    return false;
  }

  try {
    const motionMessage = await decodeDeviceMotionMessage(commandData);
    if (motionMessage.body?.control) {
      return motionMessage.body.control.command === 3; // COMMAND_RESUME
    }
  } catch (error) {
    // 解析失败，不是继续命令
  }
  
  return false;
}

/**
 * 处理 ControlMessage：处理控制命令
 * @param control ControlMessage
 * @returns RhythmFrame 数据（如果是控制命令，可能返回 null 表示需要特殊处理）
 */
function handleControlMessage(control: ControlMessage): RhythmFrame | null {
  const now = Date.now();
  
  switch (control.command) {
    case 1: // COMMAND_RESET
      return {
        t: now,
        stroke: 0, // 重置到最上端
        rotation: 0,
        intensity: 0.5,
        suck: 0.5,
        mode: 'reset'
      };
    
    case 2: // COMMAND_PAUSE
      // 暂停：返回 null，由上层处理
      return null;
    
    case 3: // COMMAND_RESUME
      // 继续：返回当前状态（保持）
      return {
        t: now,
        stroke: 0.5,
        rotation: 0,
        intensity: 0.5,
        suck: 0.5,
        mode: 'resume'
      };
    
    case 4: // COMMAND_SET_INTENSITY
      // 设置临时强度
      return {
        t: now,
        stroke: 0.5,
        rotation: 0,
        intensity: Math.max(0, Math.min(1, control.intensity || 0.5)),
        suck: 0.5,
        mode: 'set_intensity'
      };
    
    default:
      return {
        t: now,
        stroke: 0.5,
        rotation: 0,
        intensity: 0.5,
        suck: 0.5,
        mode: 'control'
      };
  }
}

/**
 * 解析 command_data 字段（真实实现）
 * @param commandData command_data 二进制数据
 * @returns 解析后的运动规划数据（RhythmFrame格式）
 */
export async function parseCommandData(commandData?: Uint8Array): Promise<RhythmFrame | null> {
  if (!commandData || commandData.length === 0) {
    // 如果没有command_data，返回默认值
    return {
      t: Date.now(),
      stroke: 0.5,
      rotation: 0,
      intensity: 0.3,
      suck: 0.5,
      mode: 'default'
    };
  }

  try {
    // 解析 DeviceMotionMessage
    const motionMessage = await decodeDeviceMotionMessage(commandData);
    
    if (!motionMessage.body) {
      return {
        t: Date.now(),
        stroke: 0.5,
        rotation: 0,
        intensity: 0.3,
        suck: 0.5,
        mode: 'empty'
      };
    }

    // 根据 body 类型处理
    if (motionMessage.body.config) {
      handleConfigMessage(motionMessage.body.config);
      // ConfigMessage 不直接生成运动数据，只是配置
      return null; // 返回 null 表示需要等待 SessionMessage
    } else if (motionMessage.body.session) {
      return handleSessionMessage(motionMessage.body.session);
    } else if (motionMessage.body.control) {
      return handleControlMessage(motionMessage.body.control);
    }
    
    return {
      t: Date.now(),
      stroke: 0.5,
      rotation: 0,
      intensity: 0.3,
      suck: 0.5,
      mode: 'unknown'
    };
  } catch (error) {
    console.error('Failed to parse command_data:', error);
    // 解析失败时返回默认值
    return {
      t: Date.now(),
      stroke: 0.5,
      rotation: 0,
      intensity: 0.3,
      suck: 0.5,
      mode: 'error'
    };
  }
}

/**
 * 将 DeviceCommand 转换为 RhythmFrame
 * @param command 设备指令消息
 * @returns 节奏帧数据（可能为 null，表示需要特殊处理，如暂停）
 */
export async function deviceCommandToRhythmFrame(command: DeviceCommand): Promise<RhythmFrame | null> {
  // 解析command_data
  const frame = await parseCommandData(command.command_data);
  
  if (!frame) {
    return null; // ConfigMessage 或暂停命令
  }
  
  // 使用command的timestamp（如果可用）
  if (command.timestamp) {
    frame.t = command.timestamp;
  }
  
  return frame;
}

