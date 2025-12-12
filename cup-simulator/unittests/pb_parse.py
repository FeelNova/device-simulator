FILE = 'config.bin'
serialized_data = open(FILE, 'rb').read()

import device_pb2 as pb
message = pb.DeviceMotionMessage()
message.ParseFromString(serialized_data)

print('=' * 20)
print(message)
print('=' * 20)

print('body is set with:', message.WhichOneof('body'))

print('number of primitives=', len(message.config.primitives))