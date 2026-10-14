import Button from "@/components/_ui/button";

type PaginationProps = { page: number; pages: number; total: number; hrefFor: (page: number) => string };

export default function Pagination({ page, pages, total, hrefFor }: PaginationProps) {
  if (pages <= 1) return <span className="caption-style text-subtle block px-4 py-3">{total} {total === 1 ? "item" : "items"}</span>;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-2 px-4 py-3">
      <span className="caption-style text-subtle">Page {page} of {pages} · {total} items</span>
      <div className="flex gap-2">
        {page > 1 && <Button href={hrefFor(page - 1)} variant="secondary" size="md">Previous</Button>}
        {page < pages && <Button href={hrefFor(page + 1)} variant="secondary" size="md">Next</Button>}
      </div>
    </nav>
  );
}
