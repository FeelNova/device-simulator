'use client';

/**
 * 旋转控制器组件
 * 在画布右上角显示一个圆形拖拽控件，用于水平360度旋转3D场景
 */

import { useRef, useState, useCallback, useEffect } from 'react';

interface RotationControllerProps {
  controlsRef: React.RefObject<any>;
}

export default function RotationController({ controlsRef }: RotationControllerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rotation, setRotation] = useState(0); // 当前旋转角度（0-360度）
  const startAngleRef = useRef<number>(0);
  const startAzimuthRef = useRef<number>(0);

  // 同步 OrbitControls 的当前方位角到显示角度
  useEffect(() => {
    if (!controlsRef.current || isDragging) return;
    
    const updateRotation = () => {
      if (!controlsRef.current || isDragging) return;
      
      const controls = controlsRef.current;
      let azimuth = 0;
      
      // 优先从spherical获取
      if (controls.spherical) {
        azimuth = controls.spherical.theta || 0;
      } else if (controls.object?.spherical) {
        azimuth = controls.object.spherical.theta || 0;
      } else if (controls.azimuthAngle !== undefined) {
        azimuth = controls.azimuthAngle;
      } else if (typeof controls.getAzimuthalAngle === 'function') {
        azimuth = controls.getAzimuthalAngle();
      }
      
      const displayAngle = ((azimuth * 180 / Math.PI) % 360 + 360) % 360;
      setRotation(displayAngle);
    };
    
    const interval = setInterval(updateRotation, 100);
    return () => clearInterval(interval);
  }, [isDragging]); // 移除 controlsRef 依赖，避免频繁重新创建 interval

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    
    if (!containerRef.current || !controlsRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // 获取当前方位角（从OrbitControls）
    let currentAzimuth = 0;
    if (controlsRef.current) {
      const controls = controlsRef.current;
      // 优先从spherical获取（drei的OrbitControls直接暴露）
      if (controls.spherical) {
        currentAzimuth = controls.spherical.theta || 0;
      } else if (controls.object?.spherical) {
        currentAzimuth = controls.object.spherical.theta || 0;
      } else if (typeof controls.getAzimuthalAngle === 'function') {
        currentAzimuth = controls.getAzimuthalAngle();
      } else if (controls.azimuthAngle !== undefined) {
        currentAzimuth = controls.azimuthAngle;
      }
    }
    startAzimuthRef.current = currentAzimuth;
    
    // 计算初始鼠标角度（从正上方开始，顺时针为正）
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    startAngleRef.current = Math.atan2(dy, dx);
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!controlsRef.current) return;
      
      const dx = moveEvent.clientX - centerX;
      const dy = moveEvent.clientY - centerY;
      const currentAngle = Math.atan2(dy, dx);
      
      // 计算角度差（鼠标拖拽的角度变化）
      let angleDelta = currentAngle - startAngleRef.current;
      
      // 处理角度跨越 -π 到 π 的情况（当鼠标快速旋转一圈时）
      if (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
      if (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;
      
      // 更新方位角：顺时针拖拽 = 顺时针旋转场景
      const newAzimuth = startAzimuthRef.current + angleDelta;
      
      // 设置方位角并更新
      const controls = controlsRef.current;
      
      // drei的OrbitControls直接暴露底层的Three.js OrbitControls
      // 可以直接访问spherical属性
      if (controls.spherical) {
        controls.spherical.theta = newAzimuth;
        controls.update();
      } else if (controls.object?.spherical) {
        // 某些情况下spherical在object上
        controls.object.spherical.theta = newAzimuth;
        controls.update();
      } else if (typeof controls.setAzimuthalAngle === 'function') {
        controls.setAzimuthalAngle(newAzimuth);
      } else if (controls.azimuthAngle !== undefined) {
        controls.azimuthAngle = newAzimuth;
        controls.update();
      }
      
      // 更新显示角度（用于显示控制器指示器）
      const displayAngle = ((newAzimuth * 180 / Math.PI) % 360 + 360) % 360;
      setRotation(displayAngle);
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [controlsRef]);

  return (
    <div
      ref={containerRef}
      className="absolute top-4 right-4 w-12 h-12 z-50 cursor-grab active:cursor-grabbing select-none pointer-events-auto"
      onMouseDown={handleMouseDown}
    >
      {/* 圆形控制器背景 */}
      <div className="w-full h-full rounded-full bg-black/60 backdrop-blur-sm border border-white/20 flex items-center justify-center relative hover:bg-black/70 transition-colors">
        {/* 旋转指示器 - 指向当前角度 */}
        <div
          className="absolute w-1 h-4 bg-white/80 rounded-full"
          style={{
            transform: `rotate(${rotation}deg) translateY(-18px)`,
            transformOrigin: 'center center',
          }}
        />
        {/* 中心点 */}
        <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
        {/* 刻度标记（可选） */}
        {[0, 90, 180, 270].map((angle) => (
          <div
            key={angle}
            className="absolute w-0.5 h-2 bg-white/40 rounded-full"
            style={{
              transform: `rotate(${angle}deg) translateY(-20px)`,
              transformOrigin: 'center center',
            }}
          />
        ))}
      </div>
    </div>
  );
}

