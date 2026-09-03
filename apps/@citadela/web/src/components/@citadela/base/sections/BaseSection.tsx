import type { HTMLAttributes } from "react";

function BaseSection({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={`ui-card p-4 ${className}`.trim()} />;
}

export default BaseSection;
