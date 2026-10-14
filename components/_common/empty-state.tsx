import type { ReactNode } from "react";

type EmptyStateProps = { title: string; description: string; action?: ReactNode };

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h2>{title}</h2>
      <p className="text-subtle max-w-[28.5em]">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
