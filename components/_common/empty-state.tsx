type EmptyStateProps = { title: string; description: string };

export default function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h2>{title}</h2>
      <p className="text-subtle max-w-[28.5em]">{description}</p>
    </div>
  );
}
