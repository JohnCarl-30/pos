import { friendlyDbError } from "@/lib/db-error";

const MESSAGES: [string, string][] = [
  ["till is closed", "This till is closed. Open it again to keep selling."],
  ["discount needs approval", "This discount is over your limit. Ask a manager to approve it."],
  ["item not available", "An item in the cart is no longer for sale. Remove it and try again."],
  ["customer not found", "That customer no longer exists. Pick another one."],
];

export function registerDbError(error: { code?: string; message?: string } | null): string {
  if (!error) return "Something went wrong. Try again.";
  const message = error.message ?? "";
  const known = MESSAGES.find(([key]) => message.includes(key));
  if (known) return known[1];
  if (error.code === "23505" && message.includes("register_sessions_one_open_idx")) return "This till is already open.";
  if (error.code === "22023" && message) return `${message.charAt(0).toUpperCase()}${message.slice(1)}.`;
  return friendlyDbError(error);
}

export type RegisterErrorKind = "approval" | "closed";

export function registerErrorKind(error: { code?: string; message?: string } | null): RegisterErrorKind | null {
  const message = error?.message ?? "";
  if (message.includes("discount needs approval")) return "approval";
  if (message.includes("till is closed")) return "closed";
  return null;
}
