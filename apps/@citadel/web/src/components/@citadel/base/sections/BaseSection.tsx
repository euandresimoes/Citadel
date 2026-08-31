import type { HTMLAttributes } from "react";
import "./BaseSection.scss";

function BaseSection({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={`base-section ${className}`.trim()} />;
}

export default BaseSection;
