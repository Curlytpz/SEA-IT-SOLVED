import { Text } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { CanvasTexture, LinearFilter, MathUtils, SRGBColorSpace } from 'three';
import sansBoldFont from 'katex/dist/fonts/KaTeX_SansSerif-Bold.woff2?url';

const SYMBOLS = [
  { label: '∫', x: -.42, y: .3, z: -1.2, scale: .8, speed: .62, phase: .2 },
  { label: 'Σ', x: .4, y: .34, z: -2.2, scale: .68, speed: .48, phase: 1.8 },
  { label: 'π', x: -.36, y: -.29, z: -2.7, scale: .55, speed: .7, phase: 3.1 },
  { label: '√', x: .38, y: -.27, z: -1.4, scale: .68, speed: .56, phase: 4.3 },
  { label: '∞', x: -.16, y: .41, z: -3.2, scale: .54, speed: .44, phase: 2.5 },
  { label: 'Δ', x: .18, y: -.4, z: -2.1, scale: .48, speed: .64, phase: 5.1 },
  { label: 'θ', x: .47, y: .03, z: -2.9, scale: .44, speed: .52, phase: 1.1 },
  { label: 'λ', x: -.47, y: -.02, z: -2.1, scale: .48, speed: .58, phase: 3.7 },
  { label: 'f(x)', x: -.29, y: .08, z: -3.6, scale: .38, speed: .46, phase: 4.8 },
  { label: 'lim', x: .29, y: .16, z: -3.1, scale: .38, speed: .5, phase: 2.2 },
  { label: 'dx', x: -.2, y: -.39, z: -3.4, scale: .34, speed: .68, phase: .8 },
  { label: 'x²', x: .14, y: .43, z: -2.7, scale: .37, speed: .54, phase: 5.6 },
  { label: '∂', x: -.46, y: .17, z: -3.3, scale: .44, speed: .6, phase: 1.4 },
  { label: '∇', x: .46, y: -.14, z: -3.5, scale: .45, speed: .42, phase: 3.9 },
];

function useSymbolTexture(label) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#ffffff';
    context.font = label.length > 2 ? '600 60px Georgia, serif' : '600 78px Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, 128, 66);
    const nextTexture = new CanvasTexture(canvas);
    nextTexture.colorSpace = SRGBColorSpace;
    nextTexture.minFilter = LinearFilter;
    return nextTexture;
  }, [label]);

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function FloatingSymbol({ spec, viewport, theme, reducedMotion }) {
  const sprite = useRef(null);
  const material = useRef(null);
  const impulse = useRef(0);
  const [hovered, setHovered] = useState(false);
  const texture = useSymbolTexture(spec.label);
  const wide = spec.label.length > 1 ? 1.55 : 1;
  const baseX = spec.x * viewport.width;
  const baseY = spec.y * viewport.height;
  const baseScaleX = spec.scale * wide;
  const baseScaleY = spec.scale;

  useEffect(() => () => {
    if (document.body.style.cursor === 'pointer') document.body.style.cursor = '';
  }, []);

  useFrame(({ clock }, delta) => {
    if (!sprite.current || !material.current) return;
    const drift = reducedMotion ? 0 : Math.sin(clock.elapsedTime * spec.speed + spec.phase) * .16;
    impulse.current = MathUtils.damp(impulse.current, 0, 3.8, delta);
    sprite.current.position.x = MathUtils.damp(sprite.current.position.x, baseX, 5, delta);
    sprite.current.position.y = MathUtils.damp(sprite.current.position.y, baseY + drift, 4, delta);
    sprite.current.position.z = MathUtils.damp(
      sprite.current.position.z,
      spec.z + (hovered ? .38 : 0) + impulse.current,
      6,
      delta,
    );
    const hoverScale = hovered ? 1.16 : 1;
    sprite.current.scale.x = MathUtils.damp(sprite.current.scale.x, baseScaleX * hoverScale, 7, delta);
    sprite.current.scale.y = MathUtils.damp(sprite.current.scale.y, baseScaleY * hoverScale, 7, delta);
    material.current.opacity = MathUtils.damp(material.current.opacity, hovered ? .8 : .38, 7, delta);
    if (!reducedMotion) material.current.rotation += delta * spec.speed * .055;
  });

  const handleHover = nextHovered => event => {
    event.stopPropagation();
    setHovered(nextHovered);
    document.body.style.cursor = nextHovered ? 'pointer' : '';
  };

  return (
    <sprite
      ref={sprite}
      position={[baseX, baseY, spec.z]}
      scale={[baseScaleX, baseScaleY, 1]}
      onPointerOver={handleHover(true)}
      onPointerOut={handleHover(false)}
      onClick={event => {
        event.stopPropagation();
        if (!reducedMotion) impulse.current = .55;
      }}
    >
      <spriteMaterial
        ref={material}
        map={texture}
        color={theme === 'dark' ? '#5eead4' : '#0f766e'}
        transparent
        opacity={.38}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
}

function ContextLossGuard({ onFailure }) {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLoss = event => {
      event.preventDefault();
      onFailure();
    };
    canvas.addEventListener('webglcontextlost', handleContextLoss);
    return () => canvas.removeEventListener('webglcontextlost', handleContextLoss);
  }, [gl, onFailure]);

  return null;
}

function Error404Object({ scale, y, theme, reducedMotion, mobile, onReady }) {
  const group = useRef(null);
  const frontColor = theme === 'dark' ? '#2dd4bf' : '#08786f';
  const edgeColor = theme === 'dark' ? '#0f766e' : '#075e58';
  const layerCount = mobile ? 5 : 9;
  const depth = mobile ? .16 : .28;
  const depthLayers = useMemo(
    () => Array.from({ length: layerCount }, (_, index) => -depth + (index / layerCount) * depth),
    [depth, layerCount],
  );

  useFrame(({ clock, pointer }, delta) => {
    if (!group.current) return;
    const pointerX = reducedMotion ? 0 : pointer.x;
    const pointerY = reducedMotion ? 0 : pointer.y;
    group.current.rotation.x = MathUtils.damp(group.current.rotation.x, pointerY * -.075, 4.5, delta);
    group.current.rotation.y = MathUtils.damp(group.current.rotation.y, pointerX * .11, 4.5, delta);
    group.current.position.y = MathUtils.damp(
      group.current.position.y,
      y + (reducedMotion ? 0 : Math.sin(clock.elapsedTime * .52) * .07),
      4,
      delta,
    );
  });

  return (
    <group ref={group} position={[0, y, 0]} scale={scale}>
      {depthLayers.map((z, index) => (
        <Text
          key={z}
          font={sansBoldFont}
          fontSize={2.55}
          letterSpacing={-.035}
          anchorX="center"
          anchorY="middle"
          position={[0, 0, z]}
          characters="404"
        >
          404
          <meshStandardMaterial color={edgeColor} roughness={.62} metalness={.06} />
        </Text>
      ))}
      <Text
        font={sansBoldFont}
        fontSize={2.55}
        letterSpacing={-.035}
        anchorX="center"
        anchorY="middle"
        position={[0, 0, .018]}
        characters="404"
        onSync={onReady}
      >
        404
        <meshStandardMaterial color={frontColor} roughness={.52} metalness={.08} />
      </Text>
    </group>
  );
}

function SceneContents({ theme, reducedMotion, onFailure, onReady }) {
  const root = useRef(null);
  const { size, viewport } = useThree();
  const mobile = size.width < 640;
  const visibleSymbols = mobile ? SYMBOLS.slice(0, 7) : SYMBOLS;
  const errorScale = Math.min(1, Math.max(.43, viewport.width / 7.35));
  const errorY = Math.min(1.48, viewport.height * .19);

  useFrame(({ pointer }, delta) => {
    if (!root.current) return;
    root.current.rotation.x = MathUtils.damp(root.current.rotation.x, reducedMotion ? 0 : pointer.y * -.018, 4, delta);
    root.current.rotation.y = MathUtils.damp(root.current.rotation.y, reducedMotion ? 0 : pointer.x * .035, 4, delta);
  });

  return (
    <group ref={root}>
      <ContextLossGuard onFailure={onFailure} />
      <ambientLight intensity={theme === 'dark' ? .78 : .96} />
      <directionalLight position={[-4, 6, 8]} intensity={theme === 'dark' ? 2.65 : 2.35} color={theme === 'dark' ? '#ccfbf1' : '#ecfdf5'} />
      <pointLight position={[4, -2, 5]} intensity={theme === 'dark' ? 21 : 14} color={theme === 'dark' ? '#14b8a6' : '#5eead4'} distance={14} />
      <Error404Object scale={errorScale} y={errorY} theme={theme} reducedMotion={reducedMotion} mobile={mobile} onReady={onReady} />
      {visibleSymbols.map(spec => (
        <FloatingSymbol key={spec.label} spec={spec} viewport={viewport} theme={theme} reducedMotion={reducedMotion} />
      ))}
    </group>
  );
}

export default function ErrorScene3D({ theme, reducedMotion, onReady, onFailure }) {
  const mobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

  return (
    <div className="not-found-scene" aria-hidden="true">
      <Canvas
        dpr={mobile ? [1, 1.2] : [1, 1.5]}
        frameloop={reducedMotion ? 'demand' : 'always'}
        camera={{ position: [0, 0, 9.6], fov: 38, near: .1, far: 40 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      >
        <Suspense fallback={null}>
          <SceneContents theme={theme} reducedMotion={reducedMotion} onFailure={onFailure} onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}
