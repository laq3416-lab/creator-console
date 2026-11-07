export default function EmptyState({
  icon = '○',
  title,
  desc,
  steps,
  cta,
}: {
  icon?: string;
  title: string;
  desc: string;
  steps?: string[];
  cta?: string;
}) {
  return (
    <div className="card empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{desc}</p>
      {steps && steps.length > 0 && (
        <ol className="empty-steps">
          {steps.map((s, i) => (
            <li key={i}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              {s}
            </li>
          ))}
        </ol>
      )}
      {cta && (
        <button className="btn ghost" disabled>
          {cta}
        </button>
      )}
    </div>
  );
}
