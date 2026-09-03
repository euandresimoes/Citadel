import { useState, type InputHTMLAttributes } from "react";
import { HiOutlineClipboardCopy, HiOutlineClipboardCheck } from "react-icons/hi";
import BaseInput from "../../base/inputs/BaseInput";

interface InputReadOnlyProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

function InputReadOnly({ label = "Value", value, className = "", ...props }: InputReadOnlyProps) {
  const [copied, setCopied] = useState(false);
  const textValue = String(value ?? "");

  async function copyValue() {
    await navigator.clipboard.writeText(textValue);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return <div className="ui-field relative">
    <BaseInput {...props} label={label} value={value} readOnly className={`pr-10 ${className}`.trim()} />
    <button className="absolute bottom-0 right-0 grid size-8 place-items-center rounded-r-md border-l border-white/[0.05] bg-[#09090a] text-muted transition-colors hover:bg-[#0e0e0f] hover:text-primary" type="button" onClick={() => void copyValue()} aria-label={copied ? "Copied" : "Copy value"} title={copied ? "Copied" : "Copy value"}>
      {copied ? <HiOutlineClipboardCheck className="size-4" aria-hidden="true" /> : <HiOutlineClipboardCopy className="size-4" aria-hidden="true" />}
    </button>
  </div>;
}

export default InputReadOnly;
