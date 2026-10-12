import { useLayoutEffect, useRef, useState } from 'react';

export type MenuItem =
  | { label: string; header: true }
  | { separator: true }
  | { label: string; action: () => void; disabled?: boolean; danger?: boolean };

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

/** Menu du clic droit, recadré pour ne jamais sortir de la fenêtre. */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPos({ left: Math.min(x, window.innerWidth - box.width - 8), top: Math.min(y, window.innerHeight - box.height - 8) });
  }, [x, y]);

  return (
    <div className="ctxmenu" ref={ref} style={pos} role="menu" onClick={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
      {items.map((item, i) => {
        if ('separator' in item) return <hr key={i} />;
        if ('header' in item) return <div key={i} className="ctxmenu-header">{item.label}</div>;
        return (
          <button key={i} role="menuitem" className={item.danger ? 'is-danger' : ''} disabled={item.disabled} onClick={() => { item.action(); onClose(); }}>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
