import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Single-select dropdown styled like the app's table picker (mm-dd-*
 * classes), but for one value at a time — used anywhere a plain <select>
 * would otherwise show the default, low-contrast browser dropdown
 * (Source Table / Source Column pickers, Source Connection picker, etc).
 *
 * The option list is rendered through a portal into document.body instead
 * of inline, positioned with `position: fixed` from the trigger's own
 * bounding box. It previously rendered inline inside `.mm-dd`, which sits
 * inside `.mm-card` (overflow: hidden) in Manual Mapping — so an open menu
 * either got clipped/cut off (looking like the option list "went away")
 * or forced the card to reserve extra empty space to avoid clipping it.
 * Portaling to the body escapes that ancestor's overflow and stacking
 * context entirely, so the menu always floats freely above everything,
 * with no layout side effects on the table underneath it. */
export function SelectDropdown({
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  value: string;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 6, left: r.left, width: r.width });
  };

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    // Reposition (rather than just close) on scroll/resize so the menu
    // tracks its trigger — e.g. scrolling the table body while the menu is
    // open. Capture phase so this fires for scrolls on any ancestor, not
    // just window-level scroll.
    const handleReposition = () => updatePosition();
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className={`mm-dd ${disabled ? "mm-dd--disabled" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`mm-dd-trigger ${open ? "open" : ""} ${!value ? "mm-dd-trigger--placeholder" : ""}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="mm-dd-value">{value || placeholder}</span>
        <span className={`mm-dd-chevron ${open ? "open" : ""}`} aria-hidden="true">▾</span>
      </button>

      {open && rect &&
        createPortal(
          <div
            ref={menuRef}
            className="mm-dd-menu mm-dd-menu--portal"
            role="listbox"
            style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width }}
          >
            <div className="mm-dd-list">
              {options.length === 0 ? (
                <div className="mm-dd-empty">No options</div>
              ) : (
                options.map((opt) => (
                  <div
                    key={opt}
                    role="option"
                    aria-selected={opt === value}
                    className={`mm-dd-item ${opt === value ? "selected" : ""}`}
                    onClick={() => {
                      onChange(opt);
                      setOpen(false);
                    }}
                  >
                    {opt}
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}