# Cup Simulator - Device Visualization

3D 设备节奏可视化模拟器，用于实时展示设备运动数据。

## 功能概述

模拟器页面展示：
1. 运行状态控制（Start/Stop Simulation）
2. Mock Mode / WebSocket 连接状态指示
3. 3D 节奏模拟器，可视化圆柱形设备的运动
4. 实时时间轴图表（Stroke 和 Rotation）
5. 实时参数显示

## 技术架构

```
算法服务 (可选)
    ↓
WebSocket 服务器 (可选)
    ↓
前端 WebSocket 客户端
    ↓
Mock 数据生成器 (默认)
    ↓
R3F 3D 动画
```

## 安装依赖

```bash
npm install
```

已安装的依赖：
- `@react-three/fiber` - React Three.js 渲染器
- `@react-three/drei` - R3F 工具库
- `three` - Three.js 3D 库
- `next` - Next.js 框架
- `react` / `react-dom` - React 库
- `tailwindcss` - CSS 框架

## 运行方式

### 1. 开发模式（Mock 数据）

直接运行 Next.js 开发服务器，使用内置的 mock 数据生成器：

```bash
npm run dev
```

访问：`http://localhost:3000`

### 2. 启用 WebSocket 模式

#### 配置环境变量

创建 `.env.local` 文件：

```env
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws/rhythm
```

#### 在模拟器中启用 WebSocket

修改 `src/app/page.tsx`：

```typescript
useSimulator({
  useWebSocket: true, // 改为 true
  wsUrl: process.env.NEXT_PUBLIC_WS_URL
});
```

## 使用说明

### 模拟器操作

1. **开始模拟**：点击 "Start Simulation" 按钮
2. **查看动画**：观察 3D 设备的实时运动
3. **查看图表**：观察 Stroke 和 Rotation 的时间轴变化
4. **停止模拟**：点击 "Stop Simulation" 按钮

### 状态指示

- **Running (绿色)**：模拟器正在运行
- **Stopped (灰色)**：模拟器已停止
- **WebSocket Connected (蓝色)**：已连接到 WebSocket 服务器
- **Mock Mode (黄色)**：使用本地 mock 数据

## 数据格式

### WebSocket 消息格式

```json
{
  "t": 1234567890,
  "stroke": 0.75,
  "rotation": 0.5,
  "intensity": 0.8,
  "mode": "demo"
}
```

### 数值范围

- `stroke`: 0-1（垂直冲程，0 = 最低，1 = 最高）
- `rotation`: -1 to 1（旋转，-1 = 逆时针最大，1 = 顺时针最大）
- `intensity`: 0-1（强度/光晕，0 = 无，1 = 最大）
- `mode`: 字符串（模式标识）

## 3D 模型说明

模拟器包含以下 3D 组件：

1. **OuterShell（外壳）**：静态圆柱体，设备外框
2. **InnerCore（内芯）**：根据 `stroke` 值垂直缩放
3. **RotationRing（旋转环）**：根据 `rotation` 值旋转
4. **GlowWave（光晕）**：根据 `intensity` 值调整发光强度

## 故障排除

### WebSocket 连接失败

- 检查 WebSocket 服务器是否运行
- 确认 `NEXT_PUBLIC_WS_URL` 环境变量正确
- 查看浏览器控制台的错误信息
- 模拟器会自动降级到 mock 模式

### 3D 动画不显示

- 检查浏览器是否支持 WebGL
- 查看浏览器控制台是否有 Three.js 错误
- 确认 R3F 组件正确加载

## 开发说明

### 文件结构

```
src/
├── app/
│   ├── layout.tsx              # Next.js 根布局
│   ├── page.tsx                # 主页面
│   └── globals.css             # 全局样式
├── components/
│   ├── RhythmDeviceScene.tsx   # R3F 3D 场景
│   ├── RhythmCanvas.tsx        # Canvas 包装器
│   └── simulator/
│       ├── TimelineChart.tsx           # 通用时间轴图表
│       ├── StrokeTimelineChart.tsx    # Stroke 图表
│       └── RotationTimelineChart.tsx  # Rotation 图表
├── hooks/
│   ├── useWebSocket.ts          # WebSocket 客户端
│   └── useSimulator.ts         # 模拟器状态管理
└── lib/
    └── rhythm/
        ├── mockGenerator.ts     # Mock 数据生成
        └── normalizeFrame.ts   # 数据标准化
```

### 自定义 Mock 数据

修改 `src/lib/rhythm/mockGenerator.ts` 中的 `mockRhythm` 函数来调整模拟节奏模式。

### 自定义 3D 模型

修改 `src/components/RhythmDeviceScene.tsx` 来调整设备的外观和动画。

## 生产部署

1. 构建项目：`npm run build`
2. 启动生产服务器：`npm start`
3. 如需 WebSocket 模式，确保 WebSocket 服务器在生产环境中运行
4. 配置正确的 `NEXT_PUBLIC_WS_URL` 环境变量
5. 使用 HTTPS/WSS 确保安全连接

## 许可证

与主项目相同。

