'use client';

/**
 * R3F 3D 设备场景组件 - 科技感套筒结构
 * 可视化圆柱形设备的节奏运动
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, MathUtils } from 'three';
import { RhythmFrame } from '@/lib/rhythm/mockGenerator';

interface RhythmDeviceSceneProps {
  frame: RhythmFrame | null;
}

// 内部柱体组件 - 火箭式分级构造
function InnerCore({ stroke, intensity }: { stroke: number; intensity: number }) {
  const coreGroupRef = useRef<Group>(null);
  
  // 根据 intensity 动态调整发光强度
  const emissiveIntensity = useMemo(() => 0.3 + intensity * 0.7, [intensity]);

  // 分级参数
  const topRadius = 0.3;      // 上段半径
  const middleRadius = 0.35; // 中段半径
  const bottomRadius = 0.4;  // 下段半径
  const coneHeight = 0.4;    // 圆锥高度
  const segmentHeight = 0.8; // 每段圆柱高度

  useFrame(() => {
    if (coreGroupRef.current) {
      // 根据 stroke 值轻微缩放（可选效果）
      const scaleY = 1 + stroke * 0.1;
      coreGroupRef.current.scale.y = scaleY;
    }
  });

  // 计算位置：确保圆锥与上段圆柱无缝衔接
  // 上段圆柱中心在 segmentHeight * 1.5，高度为 segmentHeight
  // 上段圆柱顶部在 segmentHeight * 1.5 + segmentHeight / 2 = segmentHeight * 2
  // 圆锥底部应该在 segmentHeight * 2，圆锥中心在 segmentHeight * 2 + coneHeight / 2
  const topCylinderTop = segmentHeight * 1.5 + segmentHeight / 2;
  const coneCenterY = topCylinderTop + coneHeight / 2;

  return (
    <group ref={coreGroupRef} position={[0, 0, 0]}>
      {/* 顶部圆锥尖 */}
      <mesh position={[0, coneCenterY, 0]}>
        <coneGeometry args={[topRadius, coneHeight, 32]} />
        <meshPhysicalMaterial
          color="#00d4ff"
          metalness={0.9}
          roughness={0.1}
          emissive="#0099cc"
          emissiveIntensity={emissiveIntensity}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </mesh>

      {/* 上段圆柱（小半径） */}
      <mesh position={[0, segmentHeight * 1.5, 0]}>
        <cylinderGeometry args={[topRadius, topRadius, segmentHeight, 32]} />
        <meshPhysicalMaterial
          color="#00d4ff"
          metalness={0.9}
          roughness={0.1}
          emissive="#0099cc"
          emissiveIntensity={emissiveIntensity}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </mesh>

      {/* 中段圆柱（中等半径） */}
      <mesh position={[0, segmentHeight * 0.5, 0]}>
        <cylinderGeometry args={[middleRadius, middleRadius, segmentHeight, 32]} />
        <meshPhysicalMaterial
          color="#00d4ff"
          metalness={0.9}
          roughness={0.1}
          emissive="#0099cc"
          emissiveIntensity={emissiveIntensity}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </mesh>

      {/* 下段圆柱（大半径） */}
      <mesh position={[0, -segmentHeight * 0.5, 0]}>
        <cylinderGeometry args={[bottomRadius, bottomRadius, segmentHeight, 32]} />
        <meshPhysicalMaterial
          color="#00d4ff"
          metalness={0.9}
          roughness={0.1}
          emissive="#0099cc"
          emissiveIntensity={emissiveIntensity}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </mesh>
    </group>
  );
}

// 科技线条装饰组件
function TechLines({ intensity }: { intensity: number }) {
  const linesRef = useRef<Group>(null);
  
  // 创建多条垂直科技线条
  const lineCount = 8;
  const lines = useMemo(() => {
    return Array.from({ length: lineCount }, (_, i) => {
      const angle = (i / lineCount) * Math.PI * 2;
      const radius = 0.38;
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        angle
      };
    });
  }, []);

  const emissiveIntensity = useMemo(() => 0.5 + intensity * 1.0, [intensity]);

  return (
    <group ref={linesRef}>
      {lines.map((line, index) => (
        <mesh
          key={index}
          position={[line.x, 0, line.z]}
          rotation={[0, line.angle, 0]}
        >
          <cylinderGeometry args={[0.01, 0.01, 2.6, 8]} />
          <meshStandardMaterial
            color="#00ffff"
            emissive="#00aaff"
            emissiveIntensity={emissiveIntensity}
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>
      ))}
    </group>
  );
}

// 发光能量环组件
function EnergyRings({ intensity, yPosition, radius }: { intensity: number; yPosition: number; radius: number }) {
  const ringIntensity = useMemo(() => 0.8 + intensity * 1.2, [intensity]);
  
  return (
    <group position={[0, yPosition, 0]}>
      {/* 上边缘能量环 */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, 0.02, 16, 48]} />
        <meshStandardMaterial
          color="#00aaff"
          emissive="#00ffff"
          emissiveIntensity={ringIntensity}
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>
      {/* 下边缘能量环 */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.3, 0]}>
        <torusGeometry args={[radius, 0.02, 16, 48]} />
        <meshStandardMaterial
          color="#00aaff"
          emissive="#00ffff"
          emissiveIntensity={ringIntensity}
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>
    </group>
  );
}

// 外部套筒组件
function OuterSleeve({ 
  stroke, 
  rotation, 
  suck, 
  intensity 
}: { 
  stroke: number; 
  rotation: number; 
  suck: number;
  intensity: number;
}) {
  const sleeveGroupRef = useRef<Group>(null);

  // 套筒尺寸参数
  const sleeveHeight = 0.6; // 套筒高度
  const outerRadiusMin = 0.6; // 完全收缩时的外径
  const outerRadiusMax = 0.9; // 完全放松时的外径
  
  // 根据 suck 值计算外径
  const outerRadius = outerRadiusMin + (1 - suck) * (outerRadiusMax - outerRadiusMin);
  
  // 透明度根据 suck 值调整（收缩时更透明）
  const opacity = useMemo(() => 0.4 + (1 - suck) * 0.2, [suck]);
  
  // 根据 intensity 调整发光
  const emissiveIntensity = useMemo(() => intensity * 0.6, [intensity]);

  useFrame((_, delta) => {
    if (sleeveGroupRef.current) {
      // 上下移动：根据 stroke 值
      const minY = -1.2;
      const maxY = 1.2;
      const targetY = minY + stroke * (maxY - minY);
      sleeveGroupRef.current.position.y = MathUtils.damp(
        sleeveGroupRef.current.position.y,
        targetY,
        18,
        delta
      );
      
      // 旋转：根据 rotation 值
      sleeveGroupRef.current.rotation.y = rotation * Math.PI * 2;
    }
  });

  // 创建旋转标记（用于显示旋转方向）
  const rotationMarkers = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const angle = (i / 4) * Math.PI * 2;
      return {
        x: Math.cos(angle) * (outerRadius + 0.025),
        z: Math.sin(angle) * (outerRadius + 0.025),
        angle
      };
    });
  }, [outerRadius]);

  return (
    <group ref={sleeveGroupRef}>
      {/* 连续透明套筒。避免多层透明 torus 堆叠造成的深度排序闪烁。 */}
      <mesh>
        <cylinderGeometry args={[outerRadius, outerRadius, sleeveHeight, 64, 1, true]} />
        <meshPhysicalMaterial
          color="#c0c0c0"
          metalness={0.8}
          roughness={0.2}
          transparent
          opacity={opacity}
          depthWrite={false}
          emissive="#808080"
          emissiveIntensity={emissiveIntensity}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
          transmission={0.08}
          thickness={0.2}
        />
      </mesh>
      
      {/* 旋转标记 - 在套筒表面添加发光标记，使旋转更明显 */}
      {rotationMarkers.map((marker, index) => (
        <mesh
          key={index}
          position={[marker.x, 0, marker.z]}
          rotation={[0, marker.angle, 0]}
        >
          <boxGeometry args={[0.08, sleeveHeight, 0.02]} />
          <meshStandardMaterial
            color="#00ffff"
            emissive="#00aaff"
            emissiveIntensity={0.8 + intensity * 0.5}
            metalness={0.9}
            roughness={0.1}
          />
        </mesh>
      ))}
      
      {/* 能量环 */}
      <EnergyRings intensity={intensity} yPosition={sleeveHeight / 2 - 0.15} radius={outerRadius} />
    </group>
  );
}

export default function RhythmDeviceScene({ frame }: RhythmDeviceSceneProps) {
  // 默认值
  const defaultStroke = 0.5;
  const defaultRotation = 0;
  const defaultIntensity = 0.3;
  const defaultSuck = 0.5;

  const stroke = frame?.stroke ?? defaultStroke;
  const rotation = frame?.rotation ?? defaultRotation;
  const intensity = frame?.intensity ?? defaultIntensity;
  const suck = frame?.suck ?? defaultSuck;

  return (
    <group>
      {/* 内部柱体 - 科技蓝金属材质 */}
      <InnerCore stroke={stroke} intensity={intensity} />
      
      {/* 外部套筒 - 半透明金属，可上下移动、旋转、收缩 */}
      <OuterSleeve 
        stroke={stroke}
        rotation={rotation}
        suck={suck}
        intensity={intensity}
      />
    </group>
  );
}
