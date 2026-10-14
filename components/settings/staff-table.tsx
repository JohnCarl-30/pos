"use client";

import Button from "@/components/_ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import StaffDialog from "./staff-dialog";
import type { StaffRole } from "@/lib/auth/roles";

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  storeIds: string[];
};

type StaffTableProps = { staff: StaffRow[]; stores: { id: string; name: string }[] };

export default function StaffTable({ staff, stores }: StaffTableProps) {
  const storeName = (id: string) => stores.find((store) => store.id === id)?.name ?? "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2>Staff</h2>
        <StaffDialog stores={stores} trigger={<Button variant="primary" size="md">Add staff member</Button>} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Stores</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="sr-only">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {staff.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <span className="block">{member.name}</span>
                <span className="caption-style text-subtle block">{member.email}</span>
              </TableCell>
              <TableCell className="capitalize">{member.role}</TableCell>
              <TableCell>{member.role === "owner" ? "All stores" : member.storeIds.map(storeName).join(", ")}</TableCell>
              <TableCell>{member.active ? "Active" : "Deactivated"}</TableCell>
              <TableCell className="text-right">
                <StaffDialog member={member} stores={stores} trigger={<Button variant="secondary" size="sm">Edit</Button>} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
