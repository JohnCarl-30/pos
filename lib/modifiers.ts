export type ModifierOption = { id: string; name: string; priceDelta: number };
export type ModifierGroup = { id: string; name: string; min: number; max: number; options: ModifierOption[] };
export type Selection = Record<string, string[]>;

function chosen(group: ModifierGroup, selection: Selection): ModifierOption[] {
  const picked = new Set(selection[group.id] ?? []);
  return group.options.filter((option) => picked.has(option.id));
}

export function checkSelection(groups: ModifierGroup[], selection: Selection, item: string): string | null {
  for (const group of groups) {
    const count = chosen(group, selection).length;
    if (count < group.min) return `Pick ${group.name} for ${item}`;
    if (count > group.max) return `Pick up to ${group.max} ${group.name} for ${item}`;
  }
  return null;
}

function selected(groups: ModifierGroup[], selection: Selection): ModifierOption[] {
  return groups.flatMap((group) => chosen(group, selection));
}

export function selectionIds(groups: ModifierGroup[], selection: Selection): string[] {
  return selected(groups, selection).map((option) => option.id);
}

export function selectionDelta(groups: ModifierGroup[], selection: Selection): number {
  return selected(groups, selection).reduce((sum, option) => sum + option.priceDelta, 0);
}

export function selectionLabel(groups: ModifierGroup[], selection: Selection): string {
  return selected(groups, selection)
    .map((option) => option.name)
    .join(" · ");
}

export function selectionKey(ids: string[]): string {
  return [...ids].sort().join(",");
}

export function selectionFromIds(groups: ModifierGroup[], ids: string[]): Selection {
  const wanted = new Set(ids);
  const selection: Selection = {};
  for (const group of groups) {
    const picked = group.options.filter((option) => wanted.has(option.id)).map((option) => option.id);
    if (picked.length > 0) selection[group.id] = picked;
  }
  return selection;
}

export function toggleOption(group: ModifierGroup, selection: Selection, optionId: string): Selection {
  const current = selection[group.id] ?? [];
  if (current.includes(optionId)) return { ...selection, [group.id]: current.filter((id) => id !== optionId) };
  if (group.max === 1) return { ...selection, [group.id]: [optionId] };
  return { ...selection, [group.id]: [...current, optionId] };
}

export function groupRule(min: number, max: number): string {
  if (min === max) return `Pick ${min}`;
  if (min === 0) return max === 1 ? "Optional" : `Up to ${max}`;
  return `Pick ${min}–${max}`;
}
