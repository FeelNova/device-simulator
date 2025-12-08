'use client';

/**
 * R3F Canvas 包装器组件
 * 提供 3D 场景的容器和相机设置
 */

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import RhythmDeviceScene from './RhythmDeviceScene';
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

export default function RhythmCanvas({ frame }: RhythmCanvasProps) {
  return (
    <div className="w-full h-[500px] md:h-[600px] lg:h-[700px] bg-black/20 rounded-lg overflow-hidden">
      <Suspense fallback={<LoadingFallback />}>
        <Canvas
          gl={{ antialias: true, alpha: false }}
          dpr={[1, 2]}
        >
          {/* 相机 - 调整位置让3D物体完整显示 */}
          <PerspectiveCamera
            makeDefault
            position={[2.5, 1.5, 4]}
            fov={60}
          />

          {/* 光照 */}
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} intensity={1} />
          <pointLight position={[-5, -5, -5]} intensity={0.5} />

          {/* 3D 设备场景 */}
          <RhythmDeviceScene frame={frame} />

          {/* 轨道控制器 - 允许用户旋转视角 */}
          <OrbitControls
            enablePan={false}
            enableZoom={true}
            enableRotate={true}
            minDistance={2.5}
            maxDistance={8}
            autoRotate={false}
          />
        </Canvas>
      </Suspense>
    </div>
  );
}

