import { useEffect, useId, type ReactNode } from "react";
import "./BaseModal.scss";

export interface BaseModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  descriptionId?: string;
}

function BaseModal({ open, title, children, onClose, descriptionId }: BaseModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return <div className="base-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="base-modal__dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} {...(descriptionId ? { "aria-describedby": descriptionId } : {})}>
      <header className="base-modal__header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="base-modal__close" onClick={onClose} aria-label="Close modal">×</button>
      </header>
      <div className="base-modal__content">{children}</div>
    </section>
  </div>;
}

export default BaseModal;
