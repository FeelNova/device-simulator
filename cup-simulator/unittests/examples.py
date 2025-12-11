import device_pb2

def _dump_message(message, filename):
    print(f"======== Dumping message to <{filename}>")
    print(message)
    data = message.SerializeToString()
    with open(filename, "wb") as f:
        f.write(data)

message = device_pb2.DeviceMotionMessage()
control_message = device_pb2.ControlMessage()
control_message.command = device_pb2.ControlMessage.Command.COMMAND_RESET
message.control.CopyFrom(control_message)
_dump_message(message, "reset_command.bin")


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
_dump_message(message, "config.bin")


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
units_data = input_data['body']
message = device_pb2.DeviceMotionMessage()
session_message = message.session
for unit_data in units_data:
    unit = session_message.units.add()
    unit.primitive_id = unit_data['primitive_id']
    unit.iteration = unit_data['iteration']
    unit.intensity = unit_data['intensity']
_dump_message(message, "session.bin")