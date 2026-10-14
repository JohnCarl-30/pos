export function withRunningQuantity<T extends { quantity_change: number }>(newestFirst: T[], current: number): (T & { resulting: number })[] {
  let running = current;
  return newestFirst.map((movement) => {
    const entry = { ...movement, resulting: running };
    running -= movement.quantity_change;
    return entry;
  });
}
