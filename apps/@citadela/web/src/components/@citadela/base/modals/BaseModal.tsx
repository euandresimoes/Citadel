import { useEffect, useId, useState, type ReactNode } from "react";
import { HiOutlineX } from "react-icons/hi";
import ButtonGhost from "../buttons/ButtonGhost";

export interface BaseModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  descriptionId?: string;
  showClose?: boolean;
  showHeader?: boolean;
  className?: string;
  contentClassName?: string;
}

function BaseModal({
  open,
  title,
  children,
  onClose,
  descriptionId,
  showClose = true,
  showHeader = true,
  className = "",
  contentClassName = "",
}: BaseModalProps) {
  const titleId = useId();
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const enterTimer = window.setTimeout(() => setVisible(true), 16);
      return () => window.clearTimeout(enterTimer);
    }
    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), 180);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!mounted || !open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!mounted) return null;
  return (
    <div
      className="transition-backdrop fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      data-state={visible ? "open" : "closed"}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`transition-panel ui-card w-full max-w-lg shadow-[0_18px_50px_rgba(0,0,0,0.55)] ${className}`.trim()}
        data-state={visible ? "open" : "closed"}
        role="dialog"
        aria-modal="true"
        {...(showHeader
          ? { "aria-labelledby": titleId }
          : { "aria-label": title })}
        {...(descriptionId ? { "aria-describedby": descriptionId } : {})}
      >
        {showHeader ? (
          <header className="flex items-center justify-between px-4 py-3">
            <h2
              id={titleId}
              className="font-heading text-base font-semibold text-primary"
            >
              {title}
            </h2>
            {showClose ? (
              <ButtonGhost
                type="button"
                icon={<HiOutlineX aria-hidden="true" />}
                aria-label="Close modal"
                onClick={onClose}
              />
            ) : null}
          </header>
        ) : null}
        <div
          className={`ui-card-body rounded-t-lg rounded-b-none border-b-0 ${contentClassName}`.trim()}
        >
          {children}
        </div>
      </section>
    </div>
  );
}

export default BaseModal;
