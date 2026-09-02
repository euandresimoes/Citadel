import { useId, useState } from "react";
import BaseModal from "../../base/modals/BaseModal";
import ButtonDelete from "../../base/buttons/ButtonDelete";
import ButtonSecondary from "../../base/buttons/ButtonSecondary";
import "./ConfirmationDialog.scss";

export interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pendingLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

function ConfirmationDialog({ open, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", pendingLabel = "Working…", onConfirm, onCancel }: ConfirmationDialogProps) {
  const descriptionId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try { await onConfirm(); }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Unable to complete the action"); }
    finally { setPending(false); }
  };

  const cancel = (): void => { if (!pending) onCancel(); };
  return <BaseModal open={open} title={title} onClose={cancel} descriptionId={descriptionId}>
    <p id={descriptionId} className="confirmation-dialog__message">{message}</p>
    {error ? <p className="confirmation-dialog__error" role="alert">{error}</p> : null}
    <footer className="confirmation-dialog__actions">
      <ButtonSecondary onClick={cancel} disabled={pending}>{cancelLabel}</ButtonSecondary>
      <ButtonDelete onClick={() => void confirm()} disabled={pending} aria-busy={pending}>{pending ? pendingLabel : confirmLabel}</ButtonDelete>
    </footer>
  </BaseModal>;
}

export default ConfirmationDialog;
