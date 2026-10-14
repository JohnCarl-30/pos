export const REGISTER_COOKIE = "pos-register";

export type RegisterOption = { id: string; name: string };

export function pickRegister(registers: RegisterOption[], preferredId: string | undefined): RegisterOption | null {
  const remembered = registers.find((register) => register.id === preferredId);
  if (remembered) return remembered;
  return registers.length === 1 ? registers[0] : null;
}
