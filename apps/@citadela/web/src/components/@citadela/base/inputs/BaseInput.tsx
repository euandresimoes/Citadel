import type { InputHTMLAttributes } from "react";
import "./BaseInput.scss";

export interface BaseInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

function BaseInput({ className = "", id, label, error, ...props }: BaseInputProps) {
  const inputId = id ?? props.name;
  return <label className="base-input">
    {label ? <span className="base-input__label">{label}</span> : null}
    <input {...props} id={inputId} aria-invalid={Boolean(error)} aria-describedby={error && inputId ? `${inputId}-error` : undefined} className={`base-input__control ${className}`.trim()} />
    {error && inputId ? <span id={`${inputId}-error`} className="base-input__error">{error}</span> : null}
  </label>;
}

export default BaseInput;
