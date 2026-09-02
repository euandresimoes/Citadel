import ConfirmationDialog from "../../composed/dialogs/ConfirmationDialog";

export interface ConfirmationModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmationModal({ open, title, message, confirmLabel = "Confirm", onConfirm, onCancel }: ConfirmationModalProps) {
  return <ConfirmationDialog open={open} title={title} message={message} confirmLabel={confirmLabel} onConfirm={onConfirm} onCancel={onCancel} />;
}

export default ConfirmationModal;
