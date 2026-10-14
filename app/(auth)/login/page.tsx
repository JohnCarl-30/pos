import type { Metadata } from "next";
import AuthCard from "@/components/auth/auth-card";
import LoginForm from "@/components/auth/login-form";
import { LOGIN_ERRORS } from "@/lib/auth/schemas";

export const metadata: Metadata = { title: "Sign in" };

type LoginPageProps = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, error } = await searchParams;
  const notice = error && Object.hasOwn(LOGIN_ERRORS, error) ? LOGIN_ERRORS[error] : undefined;
  return (
    <AuthCard title="Sign in" description="Use the email and password your manager set up for you.">
      <LoginForm next={next} notice={notice} />
    </AuthCard>
  );
}
