export default function ChalkboardTexture({ accent = '#2DD4BF', className = '' }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: '140px 140px',
        }}
      />
      <div
        className="absolute -left-1/4 -top-1/4 h-[70%] w-[70%] rounded-full blur-[110px]"
        style={{ background: `radial-gradient(circle, ${accent}33, transparent 70%)` }}
      />
      <div
        className="absolute -bottom-1/4 -right-1/4 h-[60%] w-[60%] rounded-full blur-[100px]"
        style={{ background: `radial-gradient(circle, ${accent}22, transparent 70%)` }}
      />
    </div>
  );
}
