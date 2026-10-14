"use client";

import Button from "@/components/_ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import StoreDialog from "./store-dialog";
import RegisterDialog from "./register-dialog";

export type StoreWithRegisters = {
  id: string;
  name: string;
  address: string | null;
  currency: string;
  timezone: string;
  prices_include_tax: boolean;
  max_cashier_discount_bps: number;
  receipt_footer: string | null;
  registers: { id: string; name: string }[];
};

export default function StoresTable({ stores }: { stores: StoreWithRegisters[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2>Stores</h2>
        <StoreDialog trigger={<Button variant="primary" size="md">Add store</Button>} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Store</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Prices</TableHead>
            <TableHead>Registers</TableHead>
            <TableHead className="sr-only">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stores.map((store) => (
            <TableRow key={store.id}>
              <TableCell>
                <span className="block">{store.name}</span>
                {store.address && <span className="caption-style text-subtle block">{store.address}</span>}
              </TableCell>
              <TableCell>{store.currency}</TableCell>
              <TableCell>{store.prices_include_tax ? "Include tax" : "Tax added"}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <span>{store.registers.map((register) => register.name).join(", ")}</span>
                  <RegisterDialog storeId={store.id} storeName={store.name} />
                </div>
              </TableCell>
              <TableCell className="text-right">
                <StoreDialog store={store} trigger={<Button variant="secondary" size="sm">Edit</Button>} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
