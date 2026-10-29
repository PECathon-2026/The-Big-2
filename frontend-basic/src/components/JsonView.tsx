import { useState } from 'react';

export function JsonView({ value, open = true, label = 'JSON' }: { value: unknown; open?: boolean; label?: string }) {
  const [isOpen, setOpen] = useState(open);
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <button className="btn small ghost" onClick={() => setOpen((o) => !o)} type="button">
          {isOpen ? 'Hide' : 'Show'} {label}
        </button>
        <button className="btn small ghost" onClick={() => void navigator.clipboard?.writeText(text ?? '')} type="button">
          Copy
        </button>
        <span className="muted small num">{text ? `${text.length.toLocaleString()} chars` : ''}</span>
      </div>
      {isOpen && <pre className="json">{text}</pre>}
    </div>
  );
}
