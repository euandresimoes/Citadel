import type { InputHTMLAttributes } from "react";

export interface BaseInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

function BaseInput({ className = "", id, label, error, ...props }: BaseInputProps) {
  const inputId = id ?? props.name;
  return <label className="ui-field">
    {label ? <span className="ui-label">{label}</span> : null}
    <input {...props} id={inputId} aria-invalid={Boolean(error)} aria-describedby={error && inputId ? `${inputId}-error` : undefined} className={`ui-input ${className}`.trim()} />
    {error && inputId ? <span id={`${inputId}-error`} className="text-xs text-red-300">{error}</span> : null}
  </label>;
}

export default BaseInput;
