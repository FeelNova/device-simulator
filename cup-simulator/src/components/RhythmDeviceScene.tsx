'use client';

/**
 * R3F 3D 设备场景组件
 * 可视化圆柱形设备的节奏运动
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Group, TorusGeometry } from 'three';
import { RhythmFrame } from '@/lib/rhythm/mockGenerator';

interface RhythmDeviceSceneProps {
  frame: RhythmFrame | null;
}

export default function RhythmDeviceScene({ frame }: RhythmDeviceSceneProps) {
  const innerCoreRef = useRef<Mesh>(null); // 内芯 - 细圆柱体，静态
  const ringGroupRef = useRef<Group>(null); // 环组 - 包含环和箭头标记
  const ringMeshRef = useRef<Mesh>(null); // 环的 mesh，用于调整半径
  const arrowGroupRef = useRef<Group>(null); // 箭头组，用于调整位置

  // 默认值
  const defaultStroke = 0.5;
  const defaultRotation = 0;
  const defaultIntensity = 0.3;
  const defaultSuck = 0.5; // 默认2档（0.5）

  // 环的半径范围
  const minRadius = 0.6; // 完全收缩时的最小半径
  const maxRadius = 0.9; // 完全放松时的最大半径
  const baseRadius = 0.75; // 基础半径（默认2档时的半径）

  // 创建环的几何体（使用基础半径）
  const ringGeometry = useMemo(() => {
    return new TorusGeometry(baseRadius, 0.12, 16, 32);
  }, []);

  useFrame(() => {
    const stroke = frame?.stroke ?? defaultStroke;
    const rotation = frame?.rotation ?? defaultRotation;
    const suck = frame?.suck ?? defaultSuck;

    // 更新环的位置（上下移动）和旋转（绕 Y 轴旋转）
    if (ringGroupRef.current) {
      // 伸缩：根据 stroke 值上下移动
      // stroke 0 时在底部，stroke 1 时在顶部
      const minY = -1.2; // 最低位置
      const maxY = 1.2;  // 最高位置
      ringGroupRef.current.position.y = minY + stroke * (maxY - minY);
      
      // 旋转：环在 XZ 平面（水平），绕 Y 轴旋转（垂直轴）
      // rotation: -1 to 1 映射到旋转角度: -360° to 360° (2π)
      ringGroupRef.current.rotation.y = rotation * Math.PI * 2;
    }

    // 更新环的半径（收缩和放松）
    // suck: 0 = 完全放松（半径最大），1 = 完全收缩（半径最小）
    const currentRadius = minRadius + (1 - suck) * (maxRadius - minRadius);
    
    if (ringMeshRef.current) {
      const scale = currentRadius / baseRadius; // 计算缩放比例
      ringMeshRef.current.scale.set(scale, scale, scale);
    }

    // 更新箭头位置，使其始终在环的边缘
    if (arrowGroupRef.current) {
      arrowGroupRef.current.position.x = currentRadius;
    }
  });

  return (
    <group>
      {/* 内芯 - 细圆柱体，静态不移动 - 蓝色系 */}
      <mesh ref={innerCoreRef} position={[0, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 2.8, 32]} />
        <meshStandardMaterial
          color="#4a8ab8"
          metalness={0.5}
          roughness={0.3}
          emissive="#3a6a98"
          emissiveIntensity={0.4}
        />
      </mesh>

      {/* 环组 - 包含环和箭头标记，可以上下移动和绕 Y 轴旋转 */}
      {/* 环水平放置在 XZ 平面，中心与内芯中心重合，只根据 stroke 上下移动 */}
      <group 
        ref={ringGroupRef} 
        position={[0, defaultStroke * 2.4 - 1.2, 0]} 
        rotation={[0, defaultRotation * Math.PI * 2, 0]}
      >
        {/* 环 - 水平圆环（XZ 平面），中心与内芯重合 - 橙色/金色系 */}
        {/* torus 默认在 XY 平面（垂直），需要绕 X 轴旋转 90 度到 XZ 平面（水平） */}
        {/* 根据 suck 值调整半径：0=完全放松（0.9），1=完全收缩（0.6） */}
        <mesh ref={ringMeshRef} rotation={[Math.PI / 2, 0, 0]} geometry={ringGeometry}>
          <meshStandardMaterial
            color="#d4a574"
            metalness={0.7}
            roughness={0.2}
            emissive="#b48554"
            emissiveIntensity={0.6}
          />
        </mesh>

        {/* 箭头标记 - 在环的平面上（XZ 平面），指向切线方向，显示旋转 */}
        {/* 箭头位置会根据环的半径动态调整 */}
        <group ref={arrowGroupRef} position={[baseRadius, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          {/* 箭头头部 - 在 XZ 平面，指向切线方向（Z 方向） */}
          <mesh position={[0, 0, 0.2]} rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[0.12, 0.3, 8]} />
            <meshStandardMaterial color="#ff6b9d" emissive="#ff6b9d" emissiveIntensity={0.8} />
          </mesh>
          {/* 箭头杆 - 在 XZ 平面 */}
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[0.04, 0.04, 0.15]} />
            <meshStandardMaterial color="#ff6b9d" emissive="#ff6b9d" emissiveIntensity={0.8} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

