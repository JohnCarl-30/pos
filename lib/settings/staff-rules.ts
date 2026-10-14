import type { StaffRole } from "@/lib/auth/roles";

type StaffChange = {
  actorStaffId: string;
  targetStaffId: string;
  nextRole: StaffRole;
  nextActive: boolean;
};

export function staffChangeError({ actorStaffId, targetStaffId, nextRole, nextActive }: StaffChange): string | null {
  if (actorStaffId !== targetStaffId) return null;
  if (!nextActive) return "You can't deactivate your own account.";
  if (nextRole !== "owner") return "You can't change your own role. Ask another owner.";
  return null;
}
