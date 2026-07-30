export function CorruptionBar({
  value,
  label = "corruption",
  className = "",
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const safe = Math.round(Math.max(0, Math.min(100, value)));
  const cells = 30;
  const filled = Math.round((safe / 100) * cells);
  return (
    <div className={`corruption-meter ${safe >= 70 ? "danger" : ""} ${className}`.trim()} aria-label={`${label}: ${safe}%`}>
      <div className="meter-heading"><span>{label}</span><output>{safe}%</output></div>
      <div className="meter-track" aria-hidden="true">
        <span>[</span>
        <span className="meter-cells">{"█".repeat(filled)}{"░".repeat(cells - filled)}</span>
        <span>]</span>
      </div>
    </div>
  );
}
