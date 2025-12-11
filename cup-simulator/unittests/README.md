# MQTT 设备指令测试脚本

用于测试 MQTT 设备指令发送功能，生成 DeviceMotionMessage 消息，封装成 DeviceCommand，并通过 MQTT 发送到 broker。

## 快速开始

### 1. 安装 Python 依赖

```bash
cd unittests
pip install -r requirements.txt
```

或者手动安装：

```bash
pip install protobuf>=4.21.0 paho-mqtt>=1.6.0
```

### 2. 安装 Protocol Buffers 编译器（必需）

**重要**: 必须安装 `protoc` 编译器才能生成 `device_command_pb2.py`（从 `device.proto` 生成）。

**macOS:**
```bash
brew install protobuf
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install protobuf-compiler
```

**Windows:**
1. 下载 [Protocol Buffers](https://github.com/protocolbuffers/protobuf/releases)
2. 解压并添加到 PATH

**验证安装:**
```bash
protoc --version
# 应该输出类似: libprotoc 3.21.0
```

### 3. 生成 Protobuf Python 代码

```bash
cd unittests
protoc --python_out=. ../src/lib/protobuf/device.proto
mv device_pb2.py device_command_pb2.py
```

这会生成 `device_command_pb2.py` 文件（测试脚本会将其导入为 `command_pb2`）。

**注意**: 由于 `device.proto` 和 `device_motion.proto` 都会生成 `device_pb2.py`，我们需要将 `device.proto` 生成的文件重命名为 `device_command_pb2.py` 以避免冲突。

### 4. 验证设置

运行检查脚本：

```bash
python check_setup.py
```

如果所有检查通过，就可以开始测试了！

## 配置

### 配置文件：`config.json`

```json
{
  "mqtt": {
    "broker_url": "mqtts://www.feelai-nova.com:8883",
    "username": "",
    "password": "",
    "keepalive": 60,
    "qos": 1
  },
  "device": {
    "token": "hw2020515"
  }
}
```

### 配置说明

- `broker_url`: MQTT broker 地址
  - 支持格式：
    - `tcp://host:port` - 普通 TCP 连接（默认端口 1883）
    - `mqtt://host:port` - MQTT 协议（默认端口 1883）
    - `mqtts://host:port` - MQTT over TLS/SSL（默认端口 8883）
  - 示例：
    - 开发环境: `tcp://localhost:1883`
    - 生产环境（TLS）: `mqtts://www.feelai-nova.com:8883`
- `username`: MQTT 用户名
  - 如果为空字符串或未设置，将使用匿名连接
  - 如果设置了用户名，必须同时设置密码
- `password`: MQTT 密码
  - 如果为空字符串或未设置，将使用匿名连接
  - 如果设置了密码，必须同时设置用户名
- `device.token`: 设备 Token（需要与模拟器中的 token 一致）

### 匿名连接

如果 broker 支持匿名连接，可以将 `username` 和 `password` 设置为空字符串 `""`，脚本会自动使用匿名连接。

## 使用方法

### 1. 交互式模式

直接运行脚本，会显示交互式菜单：

```bash
python test_mqtt_command.py
```

### 2. 命令行参数模式

```bash
# 测试 Config 消息
python test_mqtt_command.py --test config

# 测试 Session 消息
python test_mqtt_command.py --test session

# 测试 Control - RESET
python test_mqtt_command.py --test reset

# 测试 Control - PAUSE
python test_mqtt_command.py --test pause

# 测试 Control - RESUME
python test_mqtt_command.py --test resume

# 测试 Control - SET_INTENSITY
python test_mqtt_command.py --test intensity

# 测试完整流程（Config + Session）
python test_mqtt_command.py --test full
```

### 3. 自定义配置

```bash
# 使用自定义配置文件
python test_mqtt_command.py --config my_config.json --test config

# 覆盖 broker URL
python test_mqtt_command.py --broker tcp://192.168.1.100:1883 --test session

# 覆盖 device token
python test_mqtt_command.py --token my_device_token --test config
```

## 测试场景说明

### 1. Config Message
发送配置消息，定义 primitives（运动模式）：
- 包含多个 primitive，每个 primitive 包含多个 movement
- command_type: `set_mode`

### 2. Session Message
发送会话消息，开始执行运动：
- 包含多个 unit，每个 unit 指定 primitive_id、iteration、intensity
- command_type: `start`

### 3. Control Messages
发送控制命令：
- **RESET**: 重置到最上端 (command_type: `vibrate`)
- **PAUSE**: 暂停运动 (command_type: `vibrate`)
- **RESUME**: 继续运动 (command_type: `vibrate`)
- **SET_INTENSITY**: 设置临时强度 (command_type: `set_intensity`)

### 4. Full Workflow
完整工作流程：
1. 先发送 Config Message（配置运动模式）
2. 再发送 Session Message（开始执行）

## 数据流程

```
Python 测试脚本
  ↓
1. 生成 DeviceMotionMessage (使用 device_pb2.py)
   - ConfigMessage / SessionMessage / ControlMessage
  ↓
2. 序列化为 command_data (bytes)
  ↓
3. 封装成 DeviceCommand (使用 command_pb2.py)
   - device_token
   - command_type
   - command_data
   - timestamp
  ↓
4. 序列化 DeviceCommand
  ↓
5. 通过 MQTT 发送到 device/command/{deviceToken}
  ↓
模拟器接收并解析
  ↓
驱动 3D 动画
```

## 故障排查

### 1. 找不到 device_command_pb2.py

确保已运行：
```bash
cd unittests
protoc --python_out=. ../src/lib/protobuf/device.proto
mv device_pb2.py device_command_pb2.py
```

### 2. MQTT 连接失败

- 检查 broker 是否运行
- 检查 broker_url 是否正确
- 检查用户名和密码是否正确
- 检查网络连接

### 3. 模拟器未收到消息

- 确保模拟器已连接到同一个 broker
- 确保 device_token 一致
- 确保模拟器已订阅 `device/command/{deviceToken}` topic
- 检查模拟器的 MQTT 连接状态

## 文件说明

- `test_mqtt_command.py`: 主测试脚本
- `device_command_pb2.py`: DeviceCommand/DeviceRegister/DeviceHeartbeat Python 代码（从 `../src/lib/protobuf/device.proto` 生成）
- `device_pb2.py`: DeviceMotionMessage Python 代码（从 `../src/lib/protobuf/device_motion.proto` 生成）
- `config.json`: MQTT 配置文件
- `requirements.txt`: Python 依赖列表
- `examples.py`: 参考示例（生成二进制文件）

## 注意事项

- 时间戳使用毫秒单位（不是秒）
- MQTT QoS 设置为 1（至少一次交付）
- command_data 最大 128 字节
- 确保模拟器已启动并连接到 MQTT broker

