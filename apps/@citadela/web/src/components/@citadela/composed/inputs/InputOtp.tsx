import type { InputHTMLAttributes } from "react";
import "./InputOtp.scss";

interface InputOtpProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

function InputOtp({ label, id, ...props }: InputOtpProps) {
  return <label className="input-otp">
    <span>{label}</span>
    <input {...props} id={id ?? props.name} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" />
  </label>;
}

export default InputOtp;
