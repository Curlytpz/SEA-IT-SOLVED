export default function AmbientGlow({ accent = 'rgba(45, 212, 191, 0.24)', accent2 = 'rgba(110, 231, 183, 0.17)', className = '' }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: '140px 140px',
        }}
      />
      <div
        className="absolute inset-0 opacity-70"
        style={{ background: `radial-gradient(circle at 18% 22%, ${accent}, transparent 44%)` }}
      />
      <div
        className="absolute inset-0 opacity-60"
        style={{ background: `radial-gradient(circle at 82% 70%, ${accent2}, transparent 42%)` }}
      />
    </div>
  );
}
