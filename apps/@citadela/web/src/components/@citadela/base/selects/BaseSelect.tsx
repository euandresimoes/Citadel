import { useEffect, useRef, useState, type ChangeEvent, type SelectHTMLAttributes } from "react";
import { LuChevronsDownUp } from "react-icons/lu";

export interface BaseSelectOption { value: string; label: string; }

interface BaseSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: BaseSelectOption[];
}

function BaseSelect({ label, options, id, name, className = "", value, defaultValue, onChange, disabled, ...props }: BaseSelectProps) {
  const selectId = id ?? name;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [renderMenu, setRenderMenu] = useState(false);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const selectedValue = String(value ?? defaultValue ?? options[0]?.value ?? "");
  const selected = options.find((option) => option.value === selectedValue) ?? options[0];

  function updatePlacement() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuHeight = Math.min(options.length * 36 + 8, 240);
    setPlacement(window.innerHeight - rect.bottom < menuHeight && rect.top > menuHeight ? "top" : "bottom");
  }

  function close() {
    setOpen(false);
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setRenderMenu(false), 150);
  }

  function toggle() {
    if (disabled) return;
    if (open) { close(); return; }
    updatePlacement();
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    setRenderMenu(true);
    requestAnimationFrame(() => setOpen(true));
  }

  function choose(nextValue: string) {
    if (nextValue !== selectedValue) onChange?.({ target: { value: nextValue, name }, currentTarget: { value: nextValue, name } } as ChangeEvent<HTMLSelectElement>);
    close();
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!renderMenu) return;
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) close(); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { close(); triggerRef.current?.focus(); } };
    const onViewportChange = () => updatePlacement();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); window.removeEventListener("resize", onViewportChange); window.removeEventListener("scroll", onViewportChange, true); };
  }, [renderMenu]);

  useEffect(() => () => { if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current); }, []);

  return <div ref={rootRef} className="ui-field relative">
    {label ? <label className="ui-label" htmlFor={selectId ? `${selectId}-trigger` : undefined}>{label}</label> : null}
    <select {...props} id={selectId} name={name} value={selectedValue} onChange={onChange} disabled={disabled} tabIndex={-1} aria-hidden="true" className="sr-only">
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    <button ref={triggerRef} id={selectId ? `${selectId}-trigger` : undefined} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={selectId ? `${selectId}-options` : undefined} className={`ui-select flex items-center justify-between gap-2 text-left ${className}`.trim()} onClick={toggle}>
      <span className="truncate">{selected?.label}</span>
      <LuChevronsDownUp className="size-4 shrink-0 text-muted" aria-hidden="true" />
    </button>
    {renderMenu ? <div id={selectId ? `${selectId}-options` : undefined} role="listbox" aria-label={label} data-placement={placement === "top" ? "top" : undefined} data-state={open ? "open" : "closed"} className={`absolute inset-x-0 z-50 flex max-h-60 flex-col gap-1 overflow-y-auto rounded-lg border border-white/[0.1] bg-[#111113] p-1 shadow-[0_18px_50px_rgba(0,0,0,0.55)] transition-select-menu ${placement === "top" ? "bottom-full mb-2" : "top-full mt-2"}`}>
      {options.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === selectedValue} className={`flex min-h-8 w-full items-center rounded-md px-2.5 text-left text-xs transition-colors ${option.value === selectedValue ? "bg-white/[0.1] text-primary" : "text-muted hover:bg-white/[0.07] hover:text-primary"}`} onClick={() => choose(option.value)}>{option.label}</button>)}
    </div> : null}
  </div>;
}

export default BaseSelect;
