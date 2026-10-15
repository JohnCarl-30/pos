"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import ModifierGroupDialog, { type ModifierGroupRow } from "./modifier-group-dialog";
import { setModifierGroupActive } from "@/lib/catalog/modifier-actions";
import { groupRule } from "@/lib/modifiers";

export default function ModifierGroupsTable({ groups, currency }: { groups: ModifierGroupRow[]; currency: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function toggle(group: ModifierGroupRow) {
    setError(null);
    try {
      const result = await setModifierGroupActive(group.id, !group.active);
      if (!result.ok) setError(result.error ?? "Something went wrong. Try again.");
      else router.refresh();
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <span role="alert" className="caption-style text-danger px-4">{error}</span>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Group</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead className="text-right">Options</TableHead>
            <TableHead className="text-right">Products</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow key={group.id}>
              <TableCell>{group.name}</TableCell>
              <TableCell>{groupRule(group.min_choices, group.max_choices)}</TableCell>
              <TableCell className="text-right tabular-nums">{group.modifier_options.filter((option) => option.active).length}</TableCell>
              <TableCell className="text-right tabular-nums">{group.product_modifier_groups.length}</TableCell>
              <TableCell><Tag tone={group.active ? "green" : "neutral"} size="sm">{group.active ? "Active" : "Archived"}</Tag></TableCell>
              <TableCell className="text-right">
                <span className="inline-flex gap-1">
                  <ModifierGroupDialog group={group} currency={currency} trigger={<Button variant="ghost" size="sm" aria-label={`Edit ${group.name}`}>Edit</Button>} />
                  <Button variant="ghost" size="sm" aria-label={`${group.active ? "Archive" : "Restore"} ${group.name}`} onClick={() => toggle(group)}>
                    {group.active ? "Archive" : "Restore"}
                  </Button>
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
