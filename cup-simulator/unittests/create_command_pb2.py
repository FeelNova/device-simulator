#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
使用 Python protobuf 库动态编译 device.proto 并生成 device_command_pb2.py
注意：此脚本已过时，建议直接使用 protoc 命令
"""

import os
import sys

try:
    from google.protobuf import descriptor_pool
    from google.protobuf import message_factory
    import google.protobuf.descriptor_pb2 as descriptor_pb2
    from google.protobuf import text_format
except ImportError:
    print("Error: protobuf library not installed. Run: pip install protobuf")
    sys.exit(1)

def create_command_pb2_from_proto():
    """从 device.proto 文件创建 device_command_pb2.py"""
    
    proto_file = "../src/lib/protobuf/device.proto"
    if not os.path.exists(proto_file):
        print(f"Error: {proto_file} not found")
        print("Note: This script is deprecated. Use protoc directly:")
        print("  protoc --python_out=. ../src/lib/protobuf/device.proto")
        print("  mv device_pb2.py device_command_pb2.py")
        return False
    
    # 读取 proto 文件内容
    with open(proto_file, 'r', encoding='utf-8') as f:
        proto_content = f.read()
    
    # 使用 protoc 命令行工具（推荐方法）
    import subprocess
    try:
        print("Attempting to use protoc compiler...")
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
            print(f"protoc failed: {result.stderr}")
    except FileNotFoundError:
        print("protoc not found, using alternative method...")
    except Exception as e:
        print(f"Error running protoc: {e}")
    
    # 如果 protoc 不可用，提示用户使用 protoc
    print("\n" + "="*60)
    print("This script is deprecated. Please use protoc directly:")
    print("\n  cd unittests")
    print("  protoc --python_out=. ../src/lib/protobuf/device.proto")
    print("  mv device_pb2.py device_command_pb2.py")
    print("="*60)
    return False
    
    # 手动创建方式已废弃，因为 device.proto 包含更多消息类型
    # 必须使用 protoc 来正确生成 Python 代码
    return False

if __name__ == "__main__":
    success = create_command_pb2_from_proto()
    sys.exit(0 if success else 1)
