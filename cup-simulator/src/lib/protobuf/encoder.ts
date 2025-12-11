/**
 * Protobuf 编码工具
 * 用于将 TypeScript 对象编码为 Protobuf 二进制格式
 */

import protobuf from 'protobufjs';
import { DeviceRegister, DeviceHeartbeat, DeviceCommand } from './types';

let root: protobuf.Root | null = null;
let DeviceRegisterType: protobuf.Type | null = null;
let DeviceHeartbeatType: protobuf.Type | null = null;
let DeviceCommandType: protobuf.Type | null = null;

/**
 * 初始化 protobuf schema
 * 加载 device.proto 文件并编译
 */
export async function initProtobuf(): Promise<void> {
  if (root && DeviceRegisterType && DeviceHeartbeatType && DeviceCommandType) {
    return; // 已经初始化
  }

  try {
    // 使用内联 schema（因为浏览器环境无法直接读取文件）
    const protoContent = `
      syntax = "proto3";
      
      package com.sexToy.proto;
      
      enum CommandType {
        COMMAND_UNSPECIFIED = 0;
        COMMAND_START = 1;
        COMMAND_STOP = 2;
        COMMAND_TASK = 3;
      }
      
      message DeviceRegister {
        string device_token = 1;
        string device_sn = 2;
        string device_type = 3;
        uint64 register_time = 4;
      }
      
      message DeviceHeartbeat {
        string device_token = 1;
        uint64 last_online_time = 2;
        int32 battery_level = 3;
        uint64 heartbeat_time = 4;
      }
      
      message DeviceCommand {
        string device_token = 1;
        CommandType command_type = 2;
        bytes command_data = 3;
        uint64 timestamp = 4;
      }
    `;

    root = protobuf.parse(protoContent).root;
    DeviceRegisterType = root.lookupType('com.sexToy.proto.DeviceRegister');
    DeviceHeartbeatType = root.lookupType('com.sexToy.proto.DeviceHeartbeat');
    DeviceCommandType = root.lookupType('com.sexToy.proto.DeviceCommand');
  } catch (error) {
    console.error('Failed to load protobuf schema:', error);
    throw error;
  }
}

/**
 * 编码 DeviceRegister 消息
 * @param message 设备注册消息对象
 * @returns Protobuf 编码后的 Buffer
 */
export async function encodeDeviceRegister(message: DeviceRegister): Promise<Buffer> {
  await initProtobuf();
  
  if (!DeviceRegisterType) {
    throw new Error('Protobuf schema not initialized');
  }

  try {
    // 验证消息
    const errMsg = DeviceRegisterType.verify(message);
    if (errMsg) {
      throw new Error(`Invalid DeviceRegister message: ${errMsg}`);
    }

    // 创建消息对象
    const msg = DeviceRegisterType.create(message);
    
    // 编码为二进制
    const buffer = DeviceRegisterType.encode(msg).finish();
    return Buffer.from(buffer);
  } catch (error) {
    console.error('Failed to encode DeviceRegister:', error);
    throw error;
  }
}

/**
 * 编码 DeviceHeartbeat 消息
 * @param message 设备心跳消息对象
 * @returns Protobuf 编码后的 Buffer
 */
export async function encodeDeviceHeartbeat(message: DeviceHeartbeat): Promise<Buffer> {
  await initProtobuf();
  
  if (!DeviceHeartbeatType) {
    throw new Error('Protobuf schema not initialized');
  }

  try {
    // 验证消息
    const errMsg = DeviceHeartbeatType.verify(message);
    if (errMsg) {
      throw new Error(`Invalid DeviceHeartbeat message: ${errMsg}`);
    }

    // 创建消息对象
    const msg = DeviceHeartbeatType.create(message);
    
    // 编码为二进制
    const buffer = DeviceHeartbeatType.encode(msg).finish();
    return Buffer.from(buffer);
  } catch (error) {
    console.error('Failed to encode DeviceHeartbeat:', error);
    throw error;
  }
}

/**
 * 编码 DeviceCommand 消息
 * @param message 设备指令消息对象
 * @returns Protobuf 编码后的 Buffer
 */
export async function encodeDeviceCommand(message: DeviceCommand): Promise<Buffer> {
  await initProtobuf();
  
  if (!DeviceCommandType) {
    throw new Error('Protobuf schema not initialized');
  }

  try {
    // 验证消息
    const errMsg = DeviceCommandType.verify(message);
    if (errMsg) {
      throw new Error(`Invalid DeviceCommand message: ${errMsg}`);
    }

    // 创建消息对象
    const msg = DeviceCommandType.create(message);
    
    // 编码为二进制
    const buffer = DeviceCommandType.encode(msg).finish();
    return Buffer.from(buffer);
  } catch (error) {
    console.error('Failed to encode DeviceCommand:', error);
    throw error;
  }
}

