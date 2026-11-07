export type EvItem = { label: string; mine: string; peer: string };

export default function Evidence({ raw }: { raw: string | null }) {
  if (!raw) return null;
  let items: EvItem[] = [];
  try {
    items = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div className="ev-row">
      {items.map((e, i) => (
        <span className="ev-chip" key={i}>
          {e.label} <b>{e.mine}</b> <em>对比</em> {e.peer}
        </span>
      ))}
    </div>
  );
}
