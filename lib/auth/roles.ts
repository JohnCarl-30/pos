export const STAFF_ROLES = ["cashier", "manager", "owner"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export function roleAtLeast(role: StaffRole, min: StaffRole): boolean {
  return STAFF_ROLES.indexOf(role) >= STAFF_ROLES.indexOf(min);
}
