import { useEffect, useRef, useState } from "react";

/** Single-select dropdown styled like the app's table picker (mm-dd-*
 * classes), but for one value at a time — used anywhere a plain <select>
 * would otherwise show the default, low-contrast browser dropdown
 * (Source Table / Source Column pickers, Source Connection picker, etc). */
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className={`mm-dd ${disabled ? "mm-dd--disabled" : ""}`} ref={ref}>
      <button
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

      {open && (
        <div className="mm-dd-menu" role="listbox">
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
        </div>
      )}
    </div>
  );
}