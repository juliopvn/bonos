/** Rosetón guilloché (orla de título valor) generado con curvas de Lissajous/epitrocoides. */
export function Guilloche({
  size = 320,
  stroke = 'var(--color-gilt)',
  opacity = 0.35,
  className,
}: {
  size?: number;
  stroke?: string;
  opacity?: number;
  className?: string;
}) {
  const c = size / 2;
  const paths: string[] = [];
  const rings = 14;
  for (let k = 0; k < rings; k++) {
    const phase = (k / rings) * Math.PI * 2;
    const base = c * 0.55;
    const amp = c * 0.28;
    let d = '';
    const steps = 360;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const r = base + amp * Math.sin(9 * t + phase) * Math.cos(2 * t - phase / 2);
      const x = c + r * Math.cos(t);
      const y = c + r * Math.sin(t);
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    paths.push(d + 'Z');
  }
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      fill="none"
      stroke={stroke}
      strokeWidth="0.6"
      opacity={opacity}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
