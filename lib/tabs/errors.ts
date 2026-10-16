import { registerDbError } from "@/lib/register/errors";

export function tabDbError(error: { code?: string; message?: string } | null): string {
  if (error?.code === "23505" && error.message?.includes("tabs_one_open_per_table_idx")) return "That table already has an open tab.";
  return registerDbError(error).replace(/; (\p{L})/u, (_, letter: string) => `. ${letter.toUpperCase()}`);
}
