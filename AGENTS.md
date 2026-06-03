# AGENTS

## Global Rules

- 默认始终使用中文回复用户.
- 只有在用户明确要求其他语言时, 才切换到对应语言.
- 回复中所有标点符号统一使用英文半角, 例如 `,` `.` `:` `;`.
- 所有 shell 脚本在加入 Git 时, 都要显式设置可执行属性.
- 永远不要使用 `git push --force`.

## Project Overview

- 仓库根目录是 `D:\workspace\flycup\device-simulator`.
- 主应用位于 `cup-simulator/`, 是一个 Next.js 14, React 18, TypeScript, Tailwind CSS, Three.js/R3F 的设备模拟器.
- 根目录的 `MQTT_INTERACTION_DOC.md` 记录 MQTT 交互资料.
- `cup-simulator/unittests/` 包含 Python MQTT/protobuf 测试脚本和测试数据.
- `cup-simulator/src/lib/protobuf/` 和 `cup-simulator/public/` 中有 protobuf 定义, 修改协议相关逻辑时要同步检查这些文件和 Python 生成文件.

## Motion Planning Notes

- 当前上下行程动画不要使用 `Movement.direction` 字段决定移动方向. 该字段当前协议流中不使用, stroke 应从当前 `stroke` 位置连续推进, 到达 0 或 1 边界后自然反向, 避免 ring 到顶部后跳到底部.
- 当前不要按字面将 `Movement.rotation` 理解为 3D 旋转. 该字段在当前协议流里实际表示震动相关数值. `Movement.rotationDirection` 当前也不使用.

## Common Commands

在 `cup-simulator/` 目录下运行前端命令:

```bash
npm install
npm run dev
npm run build
npm run lint
```

Python MQTT/protobuf 测试位于 `cup-simulator/unittests/`:

```bash
pip install -r requirements.txt
python check_setup.py
python test_mqtt_command.py --test config
```

## Code Style

- 优先遵循现有代码风格, TypeScript 使用 `strict` 配置.
- 前端源码使用 `@/*` 路径别名引用 `src/*`.
- React 组件和 hooks 保持客户端行为清晰, 需要浏览器 API 的组件必须保留或添加 `'use client'`.
- Tailwind class 以可读性为先, 避免无关的样式重排.
- 修改 3D/Canvas 相关代码时, 注意 R3F, Three.js 对浏览器环境和渲染性能的影响.
- 不要把 broker 地址, token, username, password 等敏感信息新增到源码或文档中. 若必须说明配置, 使用占位符.

## Testing And Verification

- 修改前端 TypeScript, React, 样式或构建配置后, 至少运行 `npm run lint` 或 `npm run build`, 视改动风险选择更严格的验证.
- 修改 protobuf 编解码, MQTT 逻辑或 `unittests/` 后, 运行相关 Python 检查或脚本.
- 修改视觉或交互体验后, 启动开发服务器并在浏览器中检查关键页面, 尤其是 3D 场景是否正常渲染.
- 如果某项验证因为环境缺失, 网络或外部服务不可用而无法运行, 在最终回复中明确说明.

## Git And Files

- 不要回退用户已有改动, 除非用户明确要求.
- 不要提交 `node_modules/`, `.next/`, Python `__pycache__/`, 临时日志或本地环境文件.
- 新增或修改 shell 脚本后, 在加入 Git 前执行 `git update-index --chmod=+x <script>`.
- 部署脚本可能包含环境相关配置, 修改前先确认目标机器, 路径和权限需求.
