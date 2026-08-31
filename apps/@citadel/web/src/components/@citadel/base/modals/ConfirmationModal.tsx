import BaseModal from "./BaseModal";
import ButtonDelete from "../buttons/ButtonDelete";
import ButtonSecondary from "../buttons/ButtonSecondary";
import "./ConfirmationModal.scss";

export interface ConfirmationModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmationModal({ open, title, message, confirmLabel = "Confirm", onConfirm, onCancel }: ConfirmationModalProps) {
  return <BaseModal open={open} title={title} onClose={onCancel}>
    <p className="confirmation-modal__message">{message}</p>
    <footer className="confirmation-modal__actions">
      <ButtonSecondary onClick={onCancel}>Cancel</ButtonSecondary>
      <ButtonDelete onClick={onConfirm}>{confirmLabel}</ButtonDelete>
    </footer>
  </BaseModal>;
}

export default ConfirmationModal;
