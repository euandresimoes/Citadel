import type { ReactNode } from "react";
import "./BaseModal.scss";

export interface BaseModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}

function BaseModal({ open, title, children, onClose }: BaseModalProps) {
  if (!open) return null;
  return <div className="base-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="base-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="base-modal-title">
      <header className="base-modal__header">
        <h2 id="base-modal-title">{title}</h2>
        <button type="button" className="base-modal__close" onClick={onClose} aria-label="Close modal">×</button>
      </header>
      <div className="base-modal__content">{children}</div>
    </section>
  </div>;
}

export default BaseModal;
