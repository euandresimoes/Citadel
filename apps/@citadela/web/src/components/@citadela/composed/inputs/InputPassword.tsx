import type { InputHTMLAttributes } from "react";

interface InputPasswordProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

function InputPassword({ label, id, ...props }: InputPasswordProps) {
  return <label className="ui-field">
    <span className="ui-label">{label}</span>
    <input {...props} id={id ?? props.name} type="password" className="ui-input" />
  </label>;
}

export default InputPassword;
