#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检查测试环境设置是否正确
"""

import sys
import os

def check_dependencies():
    """检查依赖"""
    print("Checking dependencies...")
    
    # 检查 protobuf
    try:
        import google.protobuf
        print("✓ protobuf installed")
    except ImportError:
        print("✗ protobuf not installed. Run: pip install protobuf")
        return False
    
    # 检查 paho-mqtt
    try:
        import paho.mqtt.client
        print("✓ paho-mqtt installed")
    except ImportError:
        print("✗ paho-mqtt not installed. Run: pip install paho-mqtt")
        return False
    
    return True

def check_files():
    """检查必要文件"""
    print("\nChecking files...")
    
    required_files = [
        "device_pb2.py",  # DeviceMotionMessage (from device_motion.proto)
        "test_mqtt_command.py",
        "config.json"
    ]
    
    all_exist = True
    for file in required_files:
        if os.path.exists(file):
            print(f"✓ {file} exists")
        else:
            print(f"✗ {file} not found")
            all_exist = False
    
    # 检查 device_command_pb2.py (from device.proto)
    if os.path.exists("device_command_pb2.py"):
        print("✓ device_command_pb2.py exists")
    else:
        print("✗ device_command_pb2.py not found")
        print("  Run: protoc --python_out=. ../src/lib/protobuf/device.proto")
        print("  Then: mv device_pb2.py device_command_pb2.py")
        all_exist = False
    
    return all_exist

def check_protoc():
    """检查 protoc 是否安装"""
    print("\nChecking protoc compiler...")
    
    import subprocess
    try:
        result = subprocess.run(
            ['protoc', '--version'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            print(f"✓ protoc installed: {result.stdout.strip()}")
            return True
        else:
            print("✗ protoc not working properly")
            return False
    except FileNotFoundError:
        print("✗ protoc not installed")
        print("\nTo install protoc:")
        print("  macOS:   brew install protobuf")
        print("  Linux:   sudo apt-get install protobuf-compiler")
        print("  Windows: Download from https://github.com/protocolbuffers/protobuf/releases")
        return False
    except Exception as e:
        print(f"✗ Error checking protoc: {e}")
        return False

def main():
    """主函数"""
    print("="*60)
    print("MQTT Command Tester - Setup Check")
    print("="*60)
    
    deps_ok = check_dependencies()
    files_ok = check_files()
    protoc_ok = check_protoc()
    
    print("\n" + "="*60)
    if deps_ok and files_ok:
        if protoc_ok:
            print("✓ All checks passed! Ready to run tests.")
        else:
            print("⚠ Dependencies and files OK, but protoc not installed.")
            print("  You can still use the test script if command_pb2.py exists.")
        return 0
    else:
        print("✗ Some checks failed. Please fix the issues above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())

