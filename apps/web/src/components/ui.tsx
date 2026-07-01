import { formatMoney, type Cents } from "@budgetsmart/shared";
import { useEffect, type ReactNode } from "react";

/** Money display with sign-aware coloring and tabular figures. */
export function Money({
  cents,
  signed = false,
  colorize = false,
  className = "",
}: {
  cents: Cents;
  signed?: boolean;
  colorize?: boolean;
  className?: string;
}) {
  const tone = colorize ? (cents > 0 ? "amount-pos" : cents < 0 ? "danger" : "") : "";
  return <span className={`stat ${tone} ${className}`}>{formatMoney(cents, { signed })}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="row gap-sm" style={{ padding: 24, justifyContent: "center" }}>
      <span className="ring" aria-hidden />
      {label && <span className="faint text-sm">{label}</span>}
    </div>
  );
}

export function EmptyState({ icon = "◯", title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <div style={{ fontSize: 28, marginBottom: 8 }} className="faint">
        {icon}
      </div>
      <div className="muted">{title}</div>
      {hint && (
        <div className="faint text-xs" style={{ marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <span className="faint text-xs">{hint}</span>}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
        {footer && (
          <div className="row between" style={{ marginTop: 20 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="badge danger" style={{ width: "100%", justifyContent: "flex-start" }}>
      ⚠ {children}
    </div>
  );
}
