'use client';

/**
 * R3F Canvas 包装器组件
 * 提供 3D 场景的容器和相机设置
 */

import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import RhythmDeviceScene from './RhythmDeviceScene';
import RotationController from './RotationController';
import { RhythmFrame } from '@/lib/rhythm/mockGenerator';

interface RhythmCanvasProps {
  frame: RhythmFrame | null;
}

function LoadingFallback() {
  return (
    <div className="w-full h-full min-h-[500px] bg-black/20 rounded-lg flex items-center justify-center">
      <div className="text-white/50">Loading 3D scene...</div>
    </div>
  );
}

// 内部组件：用于访问 OrbitControls 的 ref 和相机
function CanvasContent({ frame, controlsRef }: { 
  frame: RhythmFrame | null; 
  controlsRef: React.RefObject<any>;
}) {
  return (
    <>
      {/* 相机 - 调整位置让3D物体完整显示，增强科技感视角 */}
      <PerspectiveCamera
        makeDefault
        position={[3, 1.8, 4.5]}
        fov={55}
      />

      {/* 增强光照系统 - 科技感照明 */}
      {/* 环境光 - 提供基础照明 */}
      <ambientLight intensity={0.4} color="#ffffff" />
      
      {/* 主方向光 - 从上方和前方照亮 */}
      <directionalLight 
        position={[5, 8, 5]} 
        intensity={1.2} 
        color="#ffffff"
        castShadow
      />
      
      {/* 辅助方向光 - 从侧面补充照明 */}
      <directionalLight 
        position={[-5, 3, -3]} 
        intensity={0.6} 
        color="#aaccff"
      />
      
      {/* 点光源 - 科技蓝光，增强发光效果 */}
      <pointLight 
        position={[0, 0, 0]} 
        intensity={0.8} 
        color="#00d4ff"
        distance={10}
        decay={2}
      />
      
      {/* 额外的点光源 - 从不同角度增强科技感 */}
      <pointLight 
        position={[3, 2, 3]} 
        intensity={0.5} 
        color="#00aaff"
        distance={8}
        decay={2}
      />
      
      <pointLight 
        position={[-3, -2, -3]} 
        intensity={0.4} 
        color="#0088ff"
        distance={8}
        decay={2}
      />

      {/* 3D 设备场景 */}
      <RhythmDeviceScene frame={frame} />

      {/* 轨道控制器 - 允许用户360度旋转视角（包括斜向旋转） */}
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableZoom={true}
        enableRotate={true}
        minDistance={2.5}
        maxDistance={8}
        autoRotate={false}
        // 允许完全360度旋转（极角：从上方0到下方π，允许从任何角度观察）
        minPolarAngle={0}
        maxPolarAngle={Math.PI}
        // 允许水平方向完全360度旋转（方位角：无限制）
        minAzimuthAngle={-Infinity}
        maxAzimuthAngle={Infinity}
        // 启用阻尼，使旋转更流畅
        enableDamping={true}
        dampingFactor={0.05}
      />
    </>
  );
}

export default function RhythmCanvas({ frame }: RhythmCanvasProps) {
  const controlsRef = useRef<any>(null);

  return (
    <div className="w-full h-full bg-black/20 rounded-lg overflow-visible relative z-10">
      <Suspense fallback={<LoadingFallback />}>
        <Canvas
          gl={{ 
            antialias: true, 
            alpha: false,
            powerPreference: "high-performance",
            toneMappingExposure: 1.2
          }}
          dpr={[1, 2]}
          shadows
        >
          <CanvasContent 
            frame={frame} 
            controlsRef={controlsRef}
          />
        </Canvas>
      </Suspense>
      
      {/* 旋转控制器 - 右上角 */}
      <RotationController controlsRef={controlsRef} />
    </div>
  );
}

