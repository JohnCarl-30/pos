export type StaffStore = {
  id: string;
  name: string;
  currency: string;
  pricesIncludeTax: boolean;
};

export function pickStore(stores: StaffStore[], preferredId: string | undefined): StaffStore | null {
  return stores.find((store) => store.id === preferredId) ?? stores[0] ?? null;
}
