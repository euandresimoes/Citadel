import type { InputHTMLAttributes } from "react";
import BaseInput from "../../base/inputs/BaseInput";

interface InputTextProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

function InputText({ label = "Display name", ...props }: InputTextProps) {
  return <BaseInput {...props} label={label} />;
}

export default InputText;
