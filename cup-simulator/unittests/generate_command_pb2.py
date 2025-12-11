#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 device_command_pb2.py 的辅助脚本
从 ../src/lib/protobuf/device.proto 生成 Python 代码
"""

import os
import sys

def generate_device_command_pb2():
    """生成 device_command_pb2.py"""
    
    # 使用 protoc 命令行工具（如果可用）
    import subprocess
    
    proto_file = "../src/lib/protobuf/device.proto"
    if not os.path.exists(proto_file):
        print(f"Error: {proto_file} not found")
        return False
    
    try:
        # 生成 device_pb2.py
        result = subprocess.run(
            ['protoc', '--python_out=.', proto_file],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            # 重命名为 device_command_pb2.py
            if os.path.exists("device_pb2.py"):
                if os.path.exists("device_command_pb2.py"):
                    os.remove("device_command_pb2.py")
                os.rename("device_pb2.py", "device_command_pb2.py")
                print("✓ Generated device_command_pb2.py using protoc")
                return True
            else:
                print("Error: protoc generated file not found")
                return False
        else:
            print(f"protoc failed: {result.stderr}")
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print("protoc not found")
    
    # 如果 protoc 不可用，提示用户安装
    print("\n" + "="*60)
    print("To generate device_command_pb2.py, please install Protocol Buffers compiler:")
    print("\n  macOS:   brew install protobuf")
    print("  Linux:   sudo apt-get install protobuf-compiler")
    print("  Windows: Download from https://github.com/protocolbuffers/protobuf/releases")
    print("\nThen run:")
    print("  cd unittests")
    print("  protoc --python_out=. ../src/lib/protobuf/device.proto")
    print("  mv device_pb2.py device_command_pb2.py")
    print("="*60)
    
    return False

if __name__ == "__main__":
    success = generate_device_command_pb2()
    sys.exit(0 if success else 1)

