import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useReducedMotion, useMotionValueEvent } from 'framer-motion';

// Requires: npm install three @react-three/fiber @react-three/drei

const NODE_COUNT = 9;
const ACCENT_HEXES = ['#6EE7B7', '#5EEAD4', '#2DD4BF'];

function useConstellationLayout() {
  return useMemo(() => {
    const nodes = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const angle = (i / NODE_COUNT) * Math.PI * 2;
      const radius = 3.2 + Math.sin(i * 1.7) * 1.6;
      nodes.push({
        position: [
          Math.cos(angle) * radius + (Math.sin(i * 3.1) - 0.5) * 1.4,
          Math.sin(angle * 1.3) * 2.4 + (Math.cos(i * 2.4) - 0.5) * 1.4,
          (Math.sin(i * 5.2) - 0.5) * 5 - 1,
        ],
        color: ACCENT_HEXES[i % ACCENT_HEXES.length],
        scale: 0.7 + (i % 3) * 0.22,
      });
    }
    return nodes;
  }, []);
}

function ParticleField({ count = 140 }) {
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 30;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 22;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 22 - 4;
    }
    return arr;
  }, [count]);

  const ref = useRef(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.008;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.06} color="#6EE7B7" transparent opacity={0.48} sizeAttenuation />
    </points>
  );
}

function Node({ node, i, refCollector }) {
  return (
    <group position={node.position} scale={node.scale} ref={el => refCollector(el, i)}>
      <mesh>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={0.65}
          roughness={0.5}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}

function ConstellationNodes({ nodes, scrollRef }) {
  const group = useRef(null);
  const meshRefs = useRef([]);

  useFrame((state, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.018;
      group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.04) * 0.06;
      group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, scrollRef.current * 3.5, 0.04);
    }
    meshRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 0.45 + i) * 0.035;
      mesh.scale.setScalar(pulse * (nodes[i]?.scale ?? 1));
    });
  });

  return (
    <group ref={group}>
      {nodes.map((node, i) => (
        <Node key={`n-${i}`} node={node} i={i} refCollector={(el, idx) => { meshRefs.current[idx] = el; }} />
      ))}
      {nodes.map((node, i) => {
        const next = nodes[(i + 3) % nodes.length];
        return (
          <Line
            key={`l-${i}`}
            points={[node.position, next.position]}
            color={node.color}
            lineWidth={1}
            transparent
            opacity={0.2}
          />
        );
      })}
    </group>
  );
}

function CameraRig({ scrollRef }) {
  const { camera, pointer } = useThree();

  useFrame(() => {
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.x * 0.7, 0.04);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, pointer.y * 0.45, 0.04);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, THREE.MathUtils.lerp(10, 6.5, scrollRef.current), 0.04);
    camera.lookAt(0, 0, -1);
  });

  return null;
}

export default function MathConstellation3D({ scrollYProgress }) {
  const nodes = useConstellationLayout();
  const scrollRef = useRef(0);
  const hostRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!hostRef.current || reducedMotion || compact) return undefined;
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { rootMargin: '160px' });
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, [compact, reducedMotion]);

  useMotionValueEvent(scrollYProgress, 'change', latest => {
    scrollRef.current = latest;
  });

  if (reducedMotion || compact) {
    return (
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_16%,rgba(45,212,191,0.13),transparent_45%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:auto,48px_48px,48px_48px]" />
    );
  }

  return (
    <div ref={hostRef} className="absolute inset-0 pointer-events-none">
      <Canvas frameloop={active ? 'always' : 'never'} camera={{ position: [0, 0, 10], fov: 55 }} dpr={[1, 1.25]} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}>
        <Suspense fallback={null}>
          <fog attach="fog" args={['#07150F', 5, 19]} />
          <ambientLight intensity={0.45} />
          <pointLight position={[5, 5, 5]} intensity={25} color="#2DD4BF" />
          <pointLight position={[-5, -3, 2]} intensity={18} color="#2DD4BF" />
          <Grid
            position={[0, -3.4, -2]}
            args={[26, 26]}
            cellSize={0.7}
            cellColor="#10251C"
            sectionSize={3.5}
            sectionColor="#2DD4BF"
            fadeDistance={17}
            fadeStrength={1.6}
            infiniteGrid
          />
          <ParticleField />
          <ConstellationNodes nodes={nodes} scrollRef={scrollRef} />
          <CameraRig scrollRef={scrollRef} />
        </Suspense>
      </Canvas>
    </div>
  );
}
