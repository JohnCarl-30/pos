import type { ReactNode } from "react";

type AuthCardProps = { title: string; description: string; children: ReactNode };

export default function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <section id="auth" className="border-line-strong bg-card flex w-full max-w-[400px] flex-col gap-6 rounded-xl border p-6">
      <div className="flex flex-col gap-2">
        <h1>{title}</h1>
        <p className="text-subtle">{description}</p>
      </div>
      {children}
    </section>
  );
}
