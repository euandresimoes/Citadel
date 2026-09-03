import type { HTMLAttributes } from "react";

interface BaseCardProps extends HTMLAttributes<HTMLDivElement> {}

function BaseCard({ className = "", ...props }: BaseCardProps) {
  return <div {...props} className={`ui-card ${className}`.trim()} />;
}

export default BaseCard;
