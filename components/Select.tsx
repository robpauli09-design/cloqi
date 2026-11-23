'use client';

import { Children, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Drop-in replacement for <select className="input">: same props (name, value/defaultValue,
 * onChange(e.target.value), disabled, id, aria-label) and the same <option> children –
 * but the opened list is styled like the rest of CLOQI. Works inside forms via a hidden input.
 */

interface Opt { value: string; label: string; disabled: boolean }

type Props = {
  id?: string;
  name?: string;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: { target: { value: string } }) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  children: React.ReactNode;
};

const textOf = (n: React.ReactNode): string =>
  typeof n === 'string' || typeof n === 'number' ? String(n)
    : Array.isArray(n) ? n.map(textOf).join('')
    : isValidElement<{ children?: React.ReactNode }>(n) ? textOf(n.props.children) : '';

function readOptions(children: React.ReactNode): Opt[] {
  const out: Opt[] = [];
  Children.toArray(children).forEach(c => {
    if (!isValidElement<{ value?: string | number; children?: React.ReactNode; disabled?: boolean }>(c)) return;
    if (c.type === 'option') {
      const label = textOf(c.props.children);
      out.push({ value: String(c.props.value ?? label), label, disabled: Boolean(c.props.disabled) });
    } else out.push(...readOptions(c.props.children));
  });
  return out;
}

export function Select({ id, name, value, defaultValue, onChange, disabled, className = '', 'aria-label': ariaLabel, children }: Props) {
  const options = useMemo(() => readOptions(children), [children]);
  const controlled = value !== undefined;
  const firstEnabled = options.find(o => !o.disabled)?.value ?? '';
  const [inner, setInner] = useState(String(defaultValue ?? firstEnabled));
  const current = controlled ? String(value) : inner;
  const selected = options.find(o => o.value === current);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean; max: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const listId = useId();

  const choose = (o: Opt) => {
    if (o.disabled) return;
    if (!controlled) setInner(o.value);
    onChange?.({ target: { value: o.value } });
    setOpen(false);
    btn.current?.focus();
  };

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 220 && above > below;
    setPos({ left: r.left, width: r.width, top: up ? r.top - 6 : r.bottom + 6, up, max: Math.min(300, Math.max(140, up ? above : below)) });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    const reflow = () => place();
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [open]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const openList = () => {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex(o => o.value === current)));
    setOpen(true);
  };
  const move = (dir: 1 | -1) => {
    let i = active;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) break;
    }
    setActive(i);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(options.findIndex(o => !o.disabled)); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[active]) choose(options[active]); }
    else if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); setOpen(false); }
    else if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
      const hit = options.findIndex(o => !o.disabled && o.label.toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  };

  const width = className.match(/\bw-\S+/)?.[0] ?? 'w-full';

  return (
    <div className={`relative ${width}`}>
      {name && <input type="hidden" name={name} value={current} disabled={disabled} />}
      <button
        ref={btn} id={id} type="button" disabled={disabled}
        role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKey}
        className={`input flex items-center gap-2 text-left font-medium hover:border-leaf/60 disabled:cursor-not-allowed disabled:opacity-60 ${open ? 'border-leaf ring-4 ring-leaf/15' : ''} ${className.replace(/\bw-\S+/, '').replace(/\binput\b/, '')}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected && !selected.disabled ? 'text-ink' : 'text-ink-faint'}`}>{selected?.label ?? 'Bitte wählen'}</span>
        <ChevronDown size={16} className={`shrink-0 text-leaf-dark transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && createPortal(
        <ul
          ref={list} id={listId} role="listbox" aria-label={ariaLabel}
          style={{ left: pos.left, width: Math.max(pos.width, 180), maxHeight: pos.max, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          className={`fixed z-[70] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-white p-1.5 shadow-lift ${pos.up ? 'origin-bottom' : 'origin-top'} animate-pop`}
        >
          {options.map((o, i) => (
            <li
              key={`${o.value}-${i}`} data-i={i} role="option" aria-selected={o.value === current} aria-disabled={o.disabled}
              onMouseEnter={() => !o.disabled && setActive(i)}
              onMouseDown={e => e.preventDefault()}
              onClick={() => choose(o)}
              className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors
                ${o.disabled ? 'cursor-default text-ink-faint' : i === active ? 'bg-leaf-soft text-leaf-deep' : 'text-ink'}
                ${o.value === current ? 'font-semibold' : 'font-medium'}`}
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.value === current && !o.disabled && <Check size={15} className="shrink-0 text-leaf-dark" />}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
