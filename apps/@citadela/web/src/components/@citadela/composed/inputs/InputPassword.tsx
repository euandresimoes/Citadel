import type { InputHTMLAttributes } from "react";
import "./InputPassword.scss";

interface InputPasswordProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

function InputPassword({ label, id, ...props }: InputPasswordProps) {
  return <label className="input-password">
    <span>{label}</span>
    <input {...props} id={id ?? props.name} type="password" />
  </label>;
}

export default InputPassword;
