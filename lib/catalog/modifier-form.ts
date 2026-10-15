import { parseMoney } from "@/lib/money";

export type ModifierGroupFormInput = {
  id?: string;
  name: string;
  min: string;
  max: string;
  active: boolean;
  options: { id?: string; name: string; price: string; active: boolean }[];
};

export type ModifierGroupPayload = {
  id?: string;
  name: string;
  min_choices: number;
  max_choices: number;
  active: boolean;
  options: { id?: string; name: string; price_delta: number; active: boolean }[];
};

function whole(value: string): number | null {
  return /^\d{1,3}$/.test(value.trim()) ? Number(value.trim()) : null;
}

export function parseModifierGroupForm(input: ModifierGroupFormInput, currency: string): { ok: true; payload: ModifierGroupPayload } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  if (!name) errors.name = "Enter a group name";
  else if (name.length > 60) errors.name = "Keep it under 60 characters";
  const min = whole(input.min);
  const max = whole(input.max);
  if (min === null) errors.min = "Enter 0 or more";
  if (max === null || max < 1) errors.max = "Enter 1 or more";
  else if (min !== null && max < min) errors.max = "Max must be at least min";

  const options: ModifierGroupPayload["options"] = [];
  const seen = new Set<string>();
  input.options.forEach((option, index) => {
    const optionName = option.name.trim();
    if (!optionName && !option.price.trim()) return;
    if (!optionName) errors[`option-${index}`] = "Enter a name";
    else if (optionName.length > 60) errors[`option-${index}`] = "Keep it under 60 characters";
    else if (seen.has(optionName.toLowerCase())) errors.options = "Option names must be different";
    seen.add(optionName.toLowerCase());
    const delta = option.price.trim() === "" ? 0 : parseMoney(option.price, currency);
    if (delta === null || Math.abs(delta) > 1_000_000) errors[`price-${index}`] = "Enter a price change, like 0.50";
    options.push({ ...(option.id ? { id: option.id } : {}), name: optionName, price_delta: delta ?? 0, active: option.active });
  });
  if (options.length === 0) errors.options = "Add at least one option";
  else if (min !== null && !errors.max && min > options.filter((option) => option.active).length) errors.min = "Min can't be more than the active options";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    payload: { ...(input.id ? { id: input.id } : {}), name, min_choices: min ?? 0, max_choices: max ?? 1, active: input.active, options },
  };
}
