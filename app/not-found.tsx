import Button from "@/components/_ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1>Page not found</h1>
      <p className="text-subtle max-w-[24em]">This page doesn&apos;t exist, or your role doesn&apos;t have access to it.</p>
      <Button href="/register" variant="secondary" size="md">Go to the register</Button>
    </main>
  );
}
