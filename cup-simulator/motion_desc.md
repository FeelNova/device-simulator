现在需要对3d动画的运动逻辑做一些改动：

当mqtt订阅接收到COMMAND_TASK为3的DeviceCommand的时候，表示收到了详细任务控制指令；

如果对该消息的commandData字段反序列化成功，则分析饭序列后的详细任务控制指令，详细任务指令是oneof body消息：

ConfigMessage类型的消息体，代表手法配置说明，语义解析如下：

1. 每个 primitive 由唯一的 primitive_id 标识。
   
   每个 primitive 包含一个 Movement 数组（数组名：movements），表示按顺序执行的一系列**最小运动单元**。
   
   Movement 定义
   
   每个 movement 表示在一个时间片内的运动行为，字段含义如下：
   
   - direction：垂直运动方向
     
     0 = 向上
     
     1 = 向下
   
   - distance：垂直运动距离（**归一化值**，表示一次完整行程的比例）
   
   - duration：该 movement 的持续时间（单位：秒）
   
   - rotation：在 duration 内完成的旋转圈数（1.0 = 完整一圈）
   
   - rotation_direction：旋转方向
     
     0 = 逆时针
     
     1 = 顺时针
   
   **语义说明**
   - distance除以duration相当于速度，也就是在这个duration内以某个速度垂直运动
   - rotaion除以duration相当于转速，也就是在这个duration内以某个速度转动

   - movements 数组整体定义了该 primitive_id 对应的**完整手法运动模板**
   
   - movements 必须 **按数组顺序依次执行**
   
   - 垂直运动与旋转在同一个 movement 中 **同步发生**

SessionMessage类型的消息体，代表详细的多通道运动控制，语义解析如下：

 包含一个Unit数组（数组名称：units）

### Unit 定义

 每个 unit 描述一次对某个 primitive 的调用，字段含如下：

- primitive_id：引用已定义的手法模板 ID

- iteration：该 primitive 连续重复执行的次数

- intensity：强度系数（倍率），用于对 primitive 中所有 movement 的运动参数进行整体缩放

### **强度规则**

- intensity 为乘法系数

- 作用于 primitive 中的运动参数（如 distance、rotation，必要时可扩展到速度）

- 不改变 movement 的时间顺序与结构

### **执行语义**

- unit严格按顺序执行

- 每个unit = primitive × iteration x intensity；

- 上一个 unit 完成后，才进入下一个 unit

ControlMessage类型，表示一条即时控制指令，不直接描述具体运动轨迹，而是影响当前或后续运动的执行状态。语义解析如下：

- 在proto文件中的定义：

```
message ControlMessage {

  enum Command {

    COMMAND_UNSPECIFIED = 0;

    COMMAND_RESET = 1;

    COMMAND_PAUSE = 2;

    COMMAND_RESUME = 3;

    COMMAND_SET_INTENSITY = 4;

  }
} 
```

**包含一个枚举类型Command， 具体语义说明**

- COMMAND_RESET
  
  立即终止当前运动流程，并将设备状态重置到初始参考位置**（如：最上端 / 零位），清空当前 Session 的执行进度。

- COMMAND_PAUSE
  
  暂停当前正在执行的运动：
  
  - 保持当前位置与姿态不变
  
  - 不丢失当前 Session / Step / Movement 的执行上下文

- COMMAND_RESUME
  
  从暂停状态恢复执行：
  
  - 从暂停时的运动位置与时间点继续
  
  - 不重新初始化 primitive 或 session

- COMMAND_SET_INTENSITY
  
  设置**运行时临时强度倍率**：
  
  - 该强度作为额外乘数作用于当前及后续运动
  
  - 与 Session 中定义的 intensity 叠加生效（乘法）
  
  - 不修改原始 Primitive / Session 配置

- COMMAND_UNSPECIFIED
  
  默认空指令，不产生任何行为。

**执行规则**

- ControlMessage 可在任意时间发送

- 指令具有**即时生效**语义

- 不改变 Session 的结构，仅影响执行状态或参数    


<!--
现在需要对3d动画的运动逻辑做一些改动：
当mqtt订阅接收到COMMAND_TASK为3的DeviceCommand的时候，表示收到了详细任务控制指令；
如果对该消息的commandData字段反序列化成功，则分析反序列化列后的详细任务控制指令，该指令数据的语义描述请根据这个描述文件：@motion_desc.md； 

然后3d动画中的具体运动，需要根据这个指令来计算和规划，其中：1. 如果是ConfigMessage类型，则记录并保存这些手法配置，继续当前的运动模式；2.如果是SessionMessage，则需要停止当前的运动，并且根据其中的描述来实现新的运动方式；对于一个Unit，如果在之前保存的手法配置里找不到对应的手法模版ID（即primitive_id），则放弃该unit的运动规划；3. 如果是ControlMessage，同样需要停止当前的运动，来实现控制目标；

最后，请在3d动画画布的最下方加一个小的日志描述区，简要描述3d动画在接收到了什么类型的任务控制指令，做出了什么响应；

要注意的点：
1.由于模拟器的垂直方向就是往复运动，所以可以忽略direction； 
2.如果收到多个 详细任务控制指令，则排队按顺序执行即可；
3.3d动画的渲染效果要和实际的运动情况表现一致；
4. 计算出的运动速度参数以及形成的timeline表格：stroke，rotaion，suck需要和实际的运动情况表现一致；
-->