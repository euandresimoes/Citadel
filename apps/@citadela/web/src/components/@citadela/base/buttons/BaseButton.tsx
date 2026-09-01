import type { ButtonHTMLAttributes } from "react";
import "./BaseButton.scss";

export interface BaseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  fullWidth?: boolean;
}

function BaseButton({ className = "", fullWidth = false, type = "button", ...props }: BaseButtonProps) {
  return <button {...props} type={type} className={`base-button${fullWidth ? " base-button--full-width" : ""} ${className}`.trim()} />;
}

export default BaseButton;
