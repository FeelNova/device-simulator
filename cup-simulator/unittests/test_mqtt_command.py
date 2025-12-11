#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MQTT 设备指令测试脚本

功能：
1. 生成 DeviceMotionMessage（config/session/control）
2. 封装成 DeviceCommand
3. 通过 MQTT 发送到 broker
4. 模拟器接收后驱动 3D 动画
"""

import json
import time
import argparse
import sys
from typing import Optional

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("Error: paho-mqtt not installed. Run: pip install paho-mqtt")
    sys.exit(1)

try:
    import device_pb2
except ImportError:
    print("Error: device_pb2 not found. Make sure device_pb2.py is in the same directory.")
    sys.exit(1)

try:
    import device_command_pb2 as command_pb2  # 使用 device.proto 生成的 Python 代码
except ImportError:
    print("Error: device_command_pb2 not found. Run: protoc --python_out=. --python_out_name=device_command_pb2.py ../src/lib/protobuf/device.proto")
    print("Note: protoc doesn't support custom output names. Instead, run:")
    print("  cd unittests")
    print("  protoc --python_out=. ../src/lib/protobuf/device.proto")
    print("  mv device_pb2.py device_command_pb2.py")
    sys.exit(1)


class MQTTCommandTester:
    """MQTT 指令测试器"""
    
    def __init__(self, config_path: str = "config.json"):
        """初始化测试器"""
        self.config = self._load_config(config_path)
        self.client = None
        self.connected = False
        
    def _load_config(self, config_path: str) -> dict:
        """加载配置文件"""
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"Warning: Config file {config_path} not found, using defaults")
            return {
                "mqtt": {
                    "broker_url": "tcp://localhost:1883",
                    "username": "admin",
                    "password": "FkgP3uUV9ad5fQ8",
                    "keepalive": 60,
                    "qos": 1
                },
                "device": {
                    "token": "hw2020515"
                }
            }
    
    def connect(self) -> bool:
        """连接 MQTT broker"""
        mqtt_config = self.config["mqtt"]
        broker_url = mqtt_config["broker_url"]
        
        # 解析 broker URL - 支持 tcp://, mqtt://, mqtts://
        use_tls = False
        if broker_url.startswith("tcp://"):
            host = broker_url[6:].split(":")[0]
            port = int(broker_url.split(":")[-1]) if ":" in broker_url[6:] else 1883
        elif broker_url.startswith("mqtt://"):
            host = broker_url[7:].split(":")[0]
            port = int(broker_url.split(":")[-1]) if ":" in broker_url[7:] else 1883
        elif broker_url.startswith("mqtts://"):
            use_tls = True
            host = broker_url[8:].split(":")[0]
            port = int(broker_url.split(":")[-1]) if ":" in broker_url[8:] else 8883
        else:
            print(f"Error: Unsupported broker URL format: {broker_url}")
            print("Supported formats: tcp://host:port, mqtt://host:port, mqtts://host:port")
            return False
        
        device_token = self.config["device"]["token"]
        client_id = f"test_client_{int(time.time())}"
        
        # 创建 MQTT 客户端 - 支持 TLS
        if use_tls:
            import ssl
            self.client = mqtt.Client(client_id=client_id, protocol=mqtt.MQTTv311)
            # 设置 TLS（对于自签名证书，使用 CERT_NONE）
            # 如果需要验证证书，可以设置为 ssl.CERT_REQUIRED 并提供 ca_certs
            self.client.tls_set(cert_reqs=ssl.CERT_NONE)
            print(f"Using TLS/SSL connection")
        else:
            self.client = mqtt.Client(client_id=client_id, protocol=mqtt.MQTTv311)
        
        # 支持匿名连接（如果用户名/密码为空或未设置，则不设置认证）
        username = mqtt_config.get("username", "")
        password = mqtt_config.get("password", "")
        if username and password:
            self.client.username_pw_set(username, password)
            print(f"Using authentication: username={username}")
        else:
            print("Using anonymous connection (no authentication)")
        
        # 设置回调
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_publish = self._on_publish
        
        try:
            print(f"Connecting to MQTT broker: {host}:{port}")
            self.client.connect(host, port, mqtt_config["keepalive"])
            self.client.loop_start()
            
            # 等待连接
            timeout = 5
            start_time = time.time()
            while not self.connected and (time.time() - start_time) < timeout:
                time.sleep(0.1)
            
            if self.connected:
                print("✓ Connected to MQTT broker")
                return True
            else:
                print("✗ Connection timeout")
                return False
        except Exception as e:
            print(f"✗ Connection failed: {e}")
            return False
    
    def _on_connect(self, client, userdata, flags, rc):
        """连接回调"""
        if rc == 0:
            self.connected = True
        else:
            print(f"✗ Connection failed with code {rc}")
    
    def _on_disconnect(self, client, userdata, rc):
        """断开连接回调"""
        self.connected = False
        if rc != 0:
            print(f"Unexpected disconnection (rc={rc})")
    
    def _on_publish(self, client, userdata, mid):
        """发布消息回调"""
        print(f"✓ Message published (mid={mid})")
    
    def _print_motion_message(self, motion_data: bytes, title: str = "DeviceMotionMessage"):
        """打印 DeviceMotionMessage 的详细内容"""
        try:
            # 反序列化 DeviceMotionMessage
            motion_msg = device_pb2.DeviceMotionMessage()
            motion_msg.ParseFromString(motion_data)
            
            print(f"\n{'='*60}")
            print(f"{title} Content:")
            print(f"{'='*60}")
            
            # 检查消息类型
            if motion_msg.HasField('config'):
                print("Type: ConfigMessage")
                print("\nConfigMessage Details:")
                config = motion_msg.config
                print(f"  Primitives count: {len(config.primitives)}")
                for i, primitive in enumerate(config.primitives, 1):
                    print(f"\n  Primitive {i}:")
                    print(f"    primitive_id: {primitive.primitive_id}")
                    print(f"    movements count: {len(primitive.movements)}")
                    for j, movement in enumerate(primitive.movements, 1):
                        direction_str = "UP" if movement.direction == 1 else "DOWN"
                        rot_dir_str = "COUNTER_CLOCKWISE" if movement.rotation_direction == 1 else "CLOCKWISE"
                        print(f"      Movement {j}:")
                        print(f"        direction: {direction_str} ({movement.direction})")
                        print(f"        distance: {movement.distance}")
                        print(f"        duration: {movement.duration}s")
                        print(f"        rotation: {movement.rotation} turns")
                        print(f"        rotation_direction: {rot_dir_str} ({movement.rotation_direction})")
            
            elif motion_msg.HasField('session'):
                print("Type: SessionMessage")
                print("\nSessionMessage Details:")
                session = motion_msg.session
                print(f"  Units count: {len(session.units)}")
                for i, unit in enumerate(session.units, 1):
                    print(f"  Unit {i}:")
                    print(f"    primitive_id: {unit.primitive_id}")
                    print(f"    iteration: {unit.iteration}")
                    print(f"    intensity: {unit.intensity}")
            
            elif motion_msg.HasField('control'):
                print("Type: ControlMessage")
                print("\nControlMessage Details:")
                control = motion_msg.control
                command_names = {
                    0: "COMMAND_UNSPECIFIED",
                    1: "COMMAND_RESET",
                    2: "COMMAND_PAUSE",
                    3: "COMMAND_RESUME",
                    4: "COMMAND_SET_INTENSITY"
                }
                command_name = command_names.get(control.command, f"UNKNOWN({control.command})")
                print(f"  command: {command_name} ({control.command})")
                if control.HasField('intensity'):
                    print(f"  intensity: {control.intensity}")
                if control.HasField('duration'):
                    print(f"  duration: {control.duration}s")
            
            else:
                print("Type: Unknown or empty message")
            
            print(f"{'='*60}\n")
            
        except Exception as e:
            print(f"Error parsing DeviceMotionMessage: {e}")
            print(f"Raw data size: {len(motion_data)} bytes")
    
    def _print_device_command(self, command: command_pb2.DeviceCommand, motion_data: bytes):
        """打印 DeviceCommand 的详细内容"""
        print(f"\n{'='*60}")
        print("DeviceCommand Content (Business Meaning):")
        print(f"{'='*60}")
        print(f"device_token: {command.device_token}")
        
        # 显示枚举名称
        command_type_names = {
            0: "COMMAND_UNSPECIFIED (未指定)",
            1: "COMMAND_START (开始运行)",
            2: "COMMAND_STOP (停止运行)",
            3: "COMMAND_TASK (详细任务指令)"
        }
        command_type_name = command_type_names.get(command.command_type, f"UNKNOWN({command.command_type})")
        print(f"command_type: {command_type_name} ({command.command_type})")
        
        timestamp_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(command.timestamp/1000))
        print(f"timestamp: {command.timestamp} ({timestamp_str})")
        print(f"command_data size: {len(command.command_data)} bytes")
        
        # 打印 command_data 中的 DeviceMotionMessage 内容
        self._print_motion_message(motion_data, "Command Data (DeviceMotionMessage)")
    
    def disconnect(self):
        """断开连接"""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            self.connected = False
            print("Disconnected from MQTT broker")
    
    def generate_config_message(self) -> bytes:
        """生成 ConfigMessage"""
        print("\n======== Generating ConfigMessage")
        
        input_data = {
            "type": "config",
            "body": {
                "primitives": [
                    {
                        "primitive_id": "primitive_1",
                        "movements": [
                            {"direction": 0, "distance": 0.2, "duration": 0.3, "rotation": 1.0, "rotation_direction": 1},
                            {"direction": 0, "distance": 0.3, "duration": 0.3, "rotation": 1.0, "rotation_direction": 1},
                            {"direction": 0, "distance": 0.3, "duration": 0.3, "rotation": 1.0, "rotation_direction": 1},
                            {"direction": 0, "distance": 0.2, "duration": 0.3, "rotation": 1.0, "rotation_direction": 1},
                            {"direction": 1, "distance": 0.2, "duration": 0.3, "rotation": 1.0, "rotation_direction": 1},
                            {"direction": 1, "distance": 0.3, "duration": 0.3, "rotation": 1.0, "rotation_direction": 1},
                            {"direction": 1, "distance": 0.3, "duration": 0.3, "rotation": 1.0, "rotation_direction": 1},
                            {"direction": 1, "distance": 0.2, "duration": 0.3, "rotation": 1.0, "rotation_direction": 1}
                        ]
                    },
                    {
                        "primitive_id": "primitive_2",
                        "movements": [
                            {"direction": 0, "distance": 0.1, "duration": 0.3, "rotation": 1.0, "rotation_direction": 1},
                            {"direction": 0, "distance": 0.4, "duration": 0.3, "rotation": 1.0, "rotation_direction": 1},
                            {"direction": 0, "distance": 0.3, "duration": 0.3, "rotation": 1.0, "rotation_direction": 1},
                            {"direction": 0, "distance": 0.2, "duration": 0.3, "rotation": 1.0, "rotation_direction": 1},
                            {"direction": 1, "distance": 0.2, "duration": 0.3, "rotation": 1.0, "rotation_direction": 1},
                            {"direction": 1, "distance": 0.3, "duration": 0.3, "rotation": 1.0, "rotation_direction": 1},
                            {"direction": 1, "distance": 0.4, "duration": 0.3, "rotation": 1.0, "rotation_direction": 1},
                            {"direction": 1, "distance": 0.1, "duration": 0.3, "rotation": 1.0, "rotation_direction": 1}
                        ]
                    }
                ]
            }
        }
        
        message = device_pb2.DeviceMotionMessage()
        config_message = message.config
        
        for primitive_data in input_data['body']['primitives']:
            primitive = config_message.primitives.add()
            primitive.primitive_id = primitive_data['primitive_id']
            for movement_data in primitive_data['movements']:
                movement = primitive.movements.add()
                movement.direction = movement_data['direction']
                movement.distance = movement_data['distance']
                movement.duration = movement_data['duration']
                movement.rotation = movement_data['rotation']
                movement.rotation_direction = movement_data['rotation_direction']
        
        data = message.SerializeToString()
        
        # 打印生成的 ConfigMessage 内容
        self._print_motion_message(data, "Generated ConfigMessage")
        
        print(f"ConfigMessage size: {len(data)} bytes")
        return data
    
    def generate_session_message(self) -> bytes:
        """生成 SessionMessage"""
        print("\n======== Generating SessionMessage")
        
        input_data = {
            "type": "session",
            "body": [
                {"primitive_id": "primitive_1", "iteration": 15, "intensity": 1.0},
                {"primitive_id": "primitive_2", "iteration": 15, "intensity": 1.0},
                {"primitive_id": "primitive_1", "iteration": 15, "intensity": 1.0},
                {"primitive_id": "primitive_2", "iteration": 15, "intensity": 1.0},
                {"primitive_id": "primitive_1", "iteration": 15, "intensity": 1.0},
                {"primitive_id": "primitive_2", "iteration": 15, "intensity": 1.0},
                {"primitive_id": "primitive_1", "iteration": 15, "intensity": 1.0},
                {"primitive_id": "primitive_2", "iteration": 15, "intensity": 1.0},
                {"primitive_id": "primitive_1", "iteration": 15, "intensity": 1.0},
                {"primitive_id": "primitive_2", "iteration": 15, "intensity": 1.0}
            ]
        }
        
        message = device_pb2.DeviceMotionMessage()
        session_message = message.session
        
        for unit_data in input_data['body']:
            unit = session_message.units.add()
            unit.primitive_id = unit_data['primitive_id']
            unit.iteration = unit_data['iteration']
            unit.intensity = unit_data['intensity']
        
        data = message.SerializeToString()
        
        # 打印生成的 SessionMessage 内容
        self._print_motion_message(data, "Generated SessionMessage")
        
        print(f"SessionMessage size: {len(data)} bytes")
        return data
    
    def generate_control_message(self, command: int) -> bytes:
        """生成 ControlMessage
        
        Args:
            command: 控制命令
                1 = COMMAND_RESET
                2 = COMMAND_PAUSE
                3 = COMMAND_RESUME
                4 = COMMAND_SET_INTENSITY
        """
        command_names = {
            1: "COMMAND_RESET",
            2: "COMMAND_PAUSE",
            3: "COMMAND_RESUME",
            4: "COMMAND_SET_INTENSITY"
        }
        print(f"\n======== Generating ControlMessage: {command_names.get(command, 'UNKNOWN')}")
        
        message = device_pb2.DeviceMotionMessage()
        control_message = message.control
        control_message.command = command
        
        # 如果是 SET_INTENSITY，设置 intensity 和 duration
        if command == 4:
            control_message.intensity = 1.5
            control_message.duration = 10.0
        
        data = message.SerializeToString()
        
        # 打印生成的 ControlMessage 内容
        self._print_motion_message(data, "Generated ControlMessage")
        
        print(f"ControlMessage size: {len(data)} bytes")
        return data
    
    def create_device_command(self, command_type: int, command_data: bytes) -> bytes:
        """创建 DeviceCommand 消息
        
        Args:
            command_type: 指令类型枚举值
                1 = COMMAND_START (开始运行)
                2 = COMMAND_STOP (停止运行)
                3 = COMMAND_TASK (详细任务指令，需解析 command_data)
            command_data: DeviceMotionMessage 序列化后的二进制数据
        """
        device_token = self.config["device"]["token"]
        timestamp = int(time.time() * 1000)  # 毫秒时间戳
        
        command = command_pb2.DeviceCommand()
        command.device_token = device_token
        command.command_type = command_type
        command.command_data = command_data
        command.timestamp = timestamp
        
        # 在序列化之前打印消息内容（业务意义）
        self._print_device_command(command, command_data)
        
        data = command.SerializeToString()
        print(f"DeviceCommand serialized size: {len(data)} bytes")
        return data
    
    def send_command(self, command_type: int, motion_message: bytes) -> bool:
        """发送设备指令
        
        Args:
            command_type: 指令类型枚举值 (1=START, 2=STOP, 3=TASK)
            motion_message: DeviceMotionMessage 序列化后的二进制数据
        """
        if not self.connected:
            print("Error: Not connected to MQTT broker")
            return False
        
        # 创建 DeviceCommand
        device_command_data = self.create_device_command(command_type, motion_message)
        
        # 发布到 MQTT Topic
        device_token = self.config["device"]["token"]
        topic = f"device/command/{device_token}"
        qos = self.config["mqtt"]["qos"]
        
        print(f"\n======== Publishing to topic: {topic}")
        result = self.client.publish(topic, device_command_data, qos=qos)
        
        if result.rc == mqtt.MQTT_ERR_SUCCESS:
            print(f"✓ Message queued for publishing")
            return True
        else:
            print(f"✗ Failed to publish message (rc={result.rc})")
            return False
    
    def test_config(self) -> bool:
        """测试发送 ConfigMessage"""
        print("\n" + "="*60)
        print("TEST: Config Message")
        print("="*60)
        
        motion_data = self.generate_config_message()
        return self.send_command(command_pb2.COMMAND_TASK, motion_data)
    
    def test_session(self) -> bool:
        """测试发送 SessionMessage"""
        print("\n" + "="*60)
        print("TEST: Session Message")
        print("="*60)
        
        motion_data = self.generate_session_message()
        return self.send_command(command_pb2.COMMAND_START, motion_data)
    
    def test_control_reset(self) -> bool:
        """测试发送 RESET 控制命令"""
        print("\n" + "="*60)
        print("TEST: Control Message - RESET")
        print("="*60)
        
        motion_data = self.generate_control_message(1)  # COMMAND_RESET
        return self.send_command(command_pb2.COMMAND_TASK, motion_data)
    
    def test_control_pause(self) -> bool:
        """测试发送 PAUSE 控制命令"""
        print("\n" + "="*60)
        print("TEST: Control Message - PAUSE")
        print("="*60)
        
        motion_data = self.generate_control_message(2)  # COMMAND_PAUSE
        return self.send_command(command_pb2.COMMAND_TASK, motion_data)
    
    def test_control_resume(self) -> bool:
        """测试发送 RESUME 控制命令"""
        print("\n" + "="*60)
        print("TEST: Control Message - RESUME")
        print("="*60)
        
        motion_data = self.generate_control_message(3)  # COMMAND_RESUME
        return self.send_command(command_pb2.COMMAND_TASK, motion_data)
    
    def test_control_set_intensity(self) -> bool:
        """测试发送 SET_INTENSITY 控制命令"""
        print("\n" + "="*60)
        print("TEST: Control Message - SET_INTENSITY")
        print("="*60)
        
        motion_data = self.generate_control_message(4)  # COMMAND_SET_INTENSITY
        return self.send_command(command_pb2.COMMAND_TASK, motion_data)
    
    def test_full_workflow(self) -> bool:
        """测试完整工作流程"""
        print("\n" + "="*60)
        print("TEST: Full Workflow (Config + Session)")
        print("="*60)
        
        # 1. 发送 Config
        print("\n[Step 1] Sending ConfigMessage...")
        config_data = self.generate_config_message()
        if not self.send_command(command_pb2.COMMAND_TASK, config_data):
            return False
        
        time.sleep(1)  # 等待1秒
        
        # 2. 发送 Session
        print("\n[Step 2] Sending SessionMessage...")
        session_data = self.generate_session_message()
        if not self.send_command(command_pb2.COMMAND_START, session_data):
            return False
        
        print("\n✓ Full workflow completed")
        return True


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="MQTT Device Command Tester")
    parser.add_argument("--config", "-c", default="config.json", help="Config file path")
    parser.add_argument("--test", "-t", choices=[
        "config", "session", "reset", "pause", "resume", "intensity", "full"
    ], help="Test scenario to run")
    parser.add_argument("--broker", "-b", help="MQTT broker URL (overrides config)")
    parser.add_argument("--token", help="Device token (overrides config)")
    
    args = parser.parse_args()
    
    # 创建测试器
    tester = MQTTCommandTester(args.config)
    
    # 覆盖配置
    if args.broker:
        tester.config["mqtt"]["broker_url"] = args.broker
    if args.token:
        tester.config["device"]["token"] = args.token
    
    # 连接 MQTT
    if not tester.connect():
        print("Failed to connect to MQTT broker")
        return 1
    
    try:
        # 运行测试
        if args.test == "config":
            success = tester.test_config()
        elif args.test == "session":
            success = tester.test_session()
        elif args.test == "reset":
            success = tester.test_control_reset()
        elif args.test == "pause":
            success = tester.test_control_pause()
        elif args.test == "resume":
            success = tester.test_control_resume()
        elif args.test == "intensity":
            success = tester.test_control_set_intensity()
        elif args.test == "full":
            success = tester.test_full_workflow()
        else:
            # 交互式菜单
            print("\n" + "="*60)
            print("MQTT Device Command Tester")
            print("="*60)
            print("\nSelect test scenario:")
            print("1. Config Message")
            print("2. Session Message")
            print("3. Control - RESET")
            print("4. Control - PAUSE")
            print("5. Control - RESUME")
            print("6. Control - SET_INTENSITY")
            print("7. Full Workflow (Config + Session)")
            print("0. Exit")
            
            choice = input("\nEnter choice (0-7): ").strip()
            
            test_map = {
                "1": ("config", tester.test_config),
                "2": ("session", tester.test_session),
                "3": ("reset", tester.test_control_reset),
                "4": ("pause", tester.test_control_pause),
                "5": ("resume", tester.test_control_resume),
                "6": ("intensity", tester.test_control_set_intensity),
                "7": ("full", tester.test_full_workflow)
            }
            
            if choice == "0":
                print("Exiting...")
                success = True
            elif choice in test_map:
                name, func = test_map[choice]
                print(f"\nRunning test: {name}")
                success = func()
            else:
                print("Invalid choice")
                success = False
        
        # 等待消息发送完成
        time.sleep(1)
        
        return 0 if success else 1
        
    finally:
        tester.disconnect()


if __name__ == "__main__":
    sys.exit(main())

