## 快速开始

### 对接步骤概览

```
1. 连接MQTT Broker
   ↓
2. 发送设备注册消息
   ↓
3. 订阅设备指令Topic
   ↓
4. 定期发送心跳消息
   ↓
5. 接收并处理设备指令
```

### 最小实现要求

1. **MQTT客户端库**: 支持MQTT 3.1.1协议
2. **Protobuf库**: 用于消息序列化/反序列化
3. **网络连接**: TCP/IP连接能力
4. **时间同步**: 获取Unix时间戳（毫秒）

---

## MQTT连接配置

### 连接参数

| 参数 | 值 | 说明 |
|------|-----|------|
| **Broker地址** | `tcp://emqx:1883` | MQTT服务器地址（生产环境）<br>开发环境: `tcp://localhost:1883` |
| **协议版本** | MQTT 3.1.1 | 必须使用此版本 |
| **Client ID** | 设备唯一标识 | 建议使用 `device_{deviceToken}` |
| **用户名** | `admin` | MQTT认证用户名 |
| **密码** | `Nova#123` | MQTT认证密码（生产环境）<br>开发环境: `FkgP3uUV9ad5fQ8` |
| **Keep-Alive** | 60秒 | 心跳间隔 |
| **Clean Session** | true | 每次连接使用新会话 |
| **QoS** | 1 | 所有消息使用QoS 1（至少一次交付） |

### 连接示例（伪代码）

```c
// MQTT连接配置
mqtt_client_config_t config = {
    .broker_url = "tcp://emqx:1883",
    .client_id = "device_abc123xyz",
    .username = "admin",
    .password = "Nova#123",
    .keepalive = 60,
    .clean_session = true,
    .qos = 1
};

// 连接MQTT Broker
mqtt_connect(&config);
```

### 连接要求

- ✅ **自动重连**: 连接断开后自动重连
- ✅ **错误处理**: 处理连接失败、网络异常等情况
- ✅ **超时设置**: 连接超时建议设置为30秒

---

## 消息格式规范

### Protocol Buffers格式

所有MQTT消息使用**Protocol Buffers (Protobuf)**格式进行序列化。

### Protobuf定义文件

```protobuf
syntax = "proto3";

package com.sexToy.proto;

// 设备注册消息（设备 → 后端）
message DeviceCommand {
  string device_token = 1[(nanopb).max_length = 128];       // 设备Token
  string command_type = 2[(nanopb).max_length = 128];      // 指令类型
  bytes command_data = 3[(nanopb).max_size = 128];         // 指令内容（二进制数据，最大128字节）
  uint64 timestamp = 4;         // 时间戳，Unix时间戳（毫秒）
}

// 设备心跳消息（设备 → 后端）
message DeviceRegister {
  string device_token = 1[(nanopb).max_length = 128];       // 设备Token
  string device_sn = 2[(nanopb).max_length = 128];          // 设备序列号（必填）
  string device_type = 3[(nanopb).max_length = 64];        // 设备类型（必填，如：vibrator, massager）
  uint64 register_time = 4;     // 注册时间戳，Unix时间戳（毫秒）
}

// 设备指令消息（后端 → 设备）
message DeviceHeartbeat {
  string device_token = 1[(nanopb).max_length = 128];       // 设备Token
  uint64 last_online_time = 2;   // 最后在线时间，Unix时间戳（毫秒）
  int32 battery_level = 3;       // 电池电量（百分比，0-100）
  uint64 heartbeat_time = 4;     // 心跳时间戳，Unix时间戳（毫秒）
}
```

### 字段说明

#### DeviceRegister（设备注册）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `device_token` | string | ✅ | 设备唯一标识符，与Topic中的deviceToken一致 |
| `device_sn` | string | ✅ | 设备硬件序列号 |
| `device_type` | string | ✅ | 设备类型，如：`vibrator`, `massager` |
| `register_time` | int64 | ✅ | 注册时间，Unix时间戳（毫秒） |

#### DeviceHeartbeat（设备心跳）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `device_token` | string | ✅ | 设备唯一标识符 |
| `last_online_time` | int64 | ✅ | 最后在线时间，Unix时间戳（毫秒） |
| `battery_level` | int32 | ✅ | 电池电量百分比（0-100） |
| `heartbeat_time` | int64 | ✅ | 心跳时间戳，Unix时间戳（毫秒） |

#### DeviceCommand（设备指令）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `device_token` | string | ✅ | 设备Token |
| `command_type` | string | ✅ | 指令类型，常见值：<br>- `start`: 启动设备<br>- `stop`: 停止设备<br>- `vibrate`: 振动控制<br>- `set_mode`: 设置模式<br>- `set_intensity`: 设置强度 |
| `command_data` | bytes | ❌ | 指令的二进制数据（可为空） |
| `timestamp` | int64 | ✅ | 消息生成时间戳，Unix时间戳（毫秒） |

### Protobuf编码说明

- **字符串编码**: UTF-8
- **整数类型**: 
  - `int32`: 32位有符号整数
  - `int64`: 64位有符号整数
- **时间戳**: Unix时间戳，单位：**毫秒**（不是秒）
- **字节数组**: 原始二进制数据

### 时间戳获取

```c
// 获取Unix时间戳（毫秒）
int64_t get_timestamp_ms() {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (int64_t)tv.tv_sec * 1000 + tv.tv_usec / 1000;
}
```

---

## Topic规范

### Topic命名规则

所有Topic遵循统一格式：`device/{action}/{deviceToken}`

### 设备需要发布的Topic（设备 → 后端）

| Topic格式 | 说明 | 示例 |
|-----------|------|------|
| `device/register/{deviceToken}` | 设备注册消息 | `device/register/abc123xyz` |
| `device/heartbeat/{deviceToken}` | 设备心跳消息 | `device/heartbeat/abc123xyz` |

**注意**: `{deviceToken}` 需要替换为实际的设备Token

### 设备需要订阅的Topic（后端 → 设备）

| Topic格式 | 说明 | 示例 |
|-----------|------|------|
| `device/command/{deviceToken}` | 设备指令消息 | `device/command/abc123xyz` |

**注意**: 
- 设备必须订阅此Topic才能接收控制指令
- `{deviceToken}` 需要替换为实际的设备Token

### Topic通配符说明

- 后端使用 `device/register/+` 订阅所有设备的注册消息
- 后端使用 `device/heartbeat/+` 订阅所有设备的心跳消息
- 设备必须使用**完整Topic路径**（不能使用通配符）

---

## 对接流程

### 完整对接流程图

```
设备启动
  ↓
连接MQTT Broker
  ↓
发送设备注册消息 (device/register/{deviceToken})
  ↓
订阅设备指令Topic (device/command/{deviceToken})
  ↓
启动心跳定时器（每30-60秒）
  ↓
┌─────────────────────────┐
│  主循环                 │
│  ├─ 定时发送心跳        │
│  ├─ 接收设备指令        │
│  └─ 处理指令并执行      │
└─────────────────────────┘
```

### 步骤1: 连接MQTT Broker

```c
// 1. 初始化MQTT客户端
mqtt_client_t *client = mqtt_client_init();

// 2. 配置连接参数
mqtt_client_set_broker(client, "tcp://emqx:1883");
mqtt_client_set_client_id(client, "device_abc123xyz");
mqtt_client_set_username(client, "admin");
mqtt_client_set_password(client, "Nova#123");
mqtt_client_set_keepalive(client, 60);

// 3. 连接
if (mqtt_client_connect(client) != 0) {
    // 连接失败，重试
    retry_connect(client);
}
```

### 步骤2: 发送设备注册消息

**时机**: 设备首次连接或重新连接后立即发送

```c
// 1. 构造DeviceRegister消息
DeviceRegister register_msg = {
    .device_token = "abc123xyz",
    .device_sn = "SN20250101001",
    .device_type = "vibrator",
    .register_time = get_timestamp_ms()
};

// 2. 序列化为Protobuf
uint8_t buffer[256];
size_t len = protobuf_encode_device_register(&register_msg, buffer, sizeof(buffer));

// 3. 发布消息
char topic[128];
sprintf(topic, "device/register/%s", register_msg.device_token);
mqtt_publish(client, topic, buffer, len, 1);  // QoS=1
```

### 步骤3: 订阅设备指令Topic

**时机**: 发送注册消息后立即订阅

```c
// 订阅设备指令Topic
char topic[128];
sprintf(topic, "device/command/%s", device_token);
mqtt_subscribe(client, topic, 1);  // QoS=1

// 设置消息回调
mqtt_set_message_callback(client, on_device_command_received);
```

### 步骤4: 定期发送心跳

**频率**: 建议每30-60秒发送一次

```c
// 心跳定时器回调
void heartbeat_timer_callback() {
    // 1. 构造DeviceHeartbeat消息
    DeviceHeartbeat heartbeat_msg = {
        .device_token = "abc123xyz",
        .last_online_time = get_timestamp_ms(),
        .battery_level = get_battery_level(),  // 获取电池电量（0-100）
        .heartbeat_time = get_timestamp_ms()
    };
    
    // 2. 序列化为Protobuf
    uint8_t buffer[128];
    size_t len = protobuf_encode_device_heartbeat(&heartbeat_msg, buffer, sizeof(buffer));
    
    // 3. 发布消息
    char topic[128];
    sprintf(topic, "device/heartbeat/%s", heartbeat_msg.device_token);
    mqtt_publish(client, topic, buffer, len, 1);  // QoS=1
}

// 启动定时器（每30秒）
start_timer(30000, heartbeat_timer_callback);
```

### 步骤5: 接收并处理设备指令

```c
// 消息接收回调
void on_device_command_received(const char *topic, uint8_t *payload, size_t len) {
    // 1. 解析Protobuf消息
    DeviceCommand command;
    if (protobuf_decode_device_command(payload, len, &command) != 0) {
        // 解析失败
        return;
    }
    
    // 2. 验证deviceToken
    if (strcmp(command.device_token, device_token) != 0) {
        // Token不匹配，忽略
        return;
    }
    
    // 3. 处理指令
    if (strcmp(command.command_type, "start") == 0) {
        device_start();
    } else if (strcmp(command.command_type, "stop") == 0) {
        device_stop();
    } else if (strcmp(command.command_type, "vibrate") == 0) {
        // 使用command_data作为振动参数
        device_vibrate(command.command_data, command.command_data_len);
    } else if (strcmp(command.command_type, "set_mode") == 0) {
        device_set_mode(command.command_data, command.command_data_len);
    } else if (strcmp(command.command_type, "set_intensity") == 0) {
        device_set_intensity(command.command_data, command.command_data_len);
    } else {
        // 未知指令类型
        log_warn("Unknown command type: %s", command.command_type);
    }
}
```

---