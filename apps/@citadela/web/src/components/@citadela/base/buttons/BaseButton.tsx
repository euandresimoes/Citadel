import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface BaseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  fullWidth?: boolean;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
}

function BaseButton({ children, className = "", fullWidth = false, icon, iconPosition = "left", type = "button", ...props }: BaseButtonProps) {
  const iconClass = icon ? ` ui-button--icon-${iconPosition}` : "";
  return <button {...props} type={type} className={`ui-button${fullWidth ? " w-full" : ""}${iconClass} ${className}`.trim()}>
    {iconPosition === "left" ? icon : null}
    {children}
    {iconPosition === "right" ? icon : null}
  </button>;
}

export default BaseButton;
