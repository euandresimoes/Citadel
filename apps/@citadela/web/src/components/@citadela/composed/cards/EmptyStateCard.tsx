import type { ReactNode } from "react";
import BaseCard from "../../base/cards/BaseCard";

interface EmptyStateCardProps { icon: ReactNode; title: string; description: string; }

function EmptyStateCard({ icon, title, description }: EmptyStateCardProps) {
  return <BaseCard className="ui-empty-card">
    <div className="ui-icon-tile mb-3" aria-hidden="true">{icon}</div>
    <h2 className="font-heading text-sm font-semibold text-primary">{title}</h2>
    <p className="mt-1.5 max-w-90 text-xs leading-5 text-muted">{description}</p>
  </BaseCard>;
}

export default EmptyStateCard;
