const MESSAGES: Record<string, string> = {
  "23505": "That name is already in use. Pick another.",
  "42501": "You don't have access to this.",
  "23503": "This is still in use, so it can't be removed.",
};

export function friendlyDbError(error: { code?: string } | null): string {
  return (error?.code && MESSAGES[error.code]) || "Something went wrong. Try again.";
}
