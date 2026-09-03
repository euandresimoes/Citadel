import type { ReactNode } from "react";

interface LayerCardProps {
  title: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

function LayerCard({ title, children, className = "", bodyClassName = "" }: LayerCardProps) {
  return <section className={`ui-card p-0 ${className}`.trim()}>
    <header className="px-4 py-3">
      <h3 className="font-heading text-sm font-semibold text-primary">{title}</h3>
    </header>
    <div className={`ui-card-body ${bodyClassName}`.trim()}>{children}</div>
  </section>;
}

export default LayerCard;
