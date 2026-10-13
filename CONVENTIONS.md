# Conventions

These rules apply to every component, page and query in this repo.

## 1. Type scale lives in `app/globals.css`

`h1`, `h2`, `h3` and `p` get their size, weight and leading from the `@layer base` scale. Never add font-size, font-weight or leading classes to them. For other elements use `.h1-style`, `.h2-style`, `.h3-style`, `.p-style`, `.lead-style`, `.caption-style` or `.eyebrow-style`. If a design needs different values, change the scale in `globals.css`, not the element.

## 2. Folder structure

- `components/_ui/` — primitives (Button, Input, Dialog, Select, Table…). No data access.
- `components/_common/` — app-wide pieces (sidebar, page header, command menu, empty state).
- `components/<feature>/` — one folder per feature (`auth`, `setup`, `settings`, later `register`, `products`…).
- `app/` — routes only: fetch data, check roles, render feature components.
- `lib/` — pure logic and data helpers. Pure modules must not import `next/*` so they stay unit-testable.
- `public/assets/images/<feature>/` — images and icons; shared icons in `_common/`.

## 3. Page structure

Each page renders one `<section id="<name>" className="flex min-h-0 min-w-0 flex-1 flex-col">` with a `PageHeader` first, then the page body.

## 4. Buttons

Every button or button-styled link is `Button` from `@/components/_ui/button`. Always pass `variant` and `size` explicitly. Pass `href` to render a link.

## 5. Max widths

Text max-widths use `em`: headings `max-w-[Nem]`; paragraphs convert the design's px width by dividing by the font size.

## 6. Tailwind only

No CSS modules, styled-components or inline `style` (except setting CSS variables). Use the tokens in `globals.css` (`text-subtle`, `bg-secondary`, `border-line-strong`…), not raw hex, unless matching an existing primitive.

## 7. Borders between items

Use `divide-y` / `divide-x` (or the outline pattern already used in `_ui/table.tsx`) for borders between stacked items, not per-item borders.

## 8. SVGs and icons

Icons are SVG files (14×14 viewBox, `currentColor` strokes) imported as components through SVGR: `import Icon from "@/public/assets/images/_common/nav/orders.svg"`. Decorative icons get `aria-hidden`. No icon libraries. Static illustrations that don't need CSS go through `<Image />` by path.

## 9. Motion

Use the shared power easings: `ease-power3-out` / `ease-power3-in` utilities in Tailwind and `ease` from `lib/easings.ts` in Motion.

## 10. No comments

Don't write code comments. Name things so they don't need them.

## 11. Media

Every image, video, Rive and Lottie goes through the `Asset` component in `components/_ui/asset`, typed by `type`, with `width`/`height` as the aspect ratio.

## 12. Scroll restoration

`ScrollToTop` owns scroll restoration. Don't add another.

## 13. Data access

- Server Components read with `createClient()` from `lib/supabase/server.ts`.
- Writes are Server Actions returning `ActionResult` from `lib/action-result.ts`, validated with zod schemas from `lib/`.
- Check access with `requireStaff()` / `requireRole()` from `lib/auth/staff.ts` at the top of every page and action. RLS enforces the same rules in the database; the checks in code exist for good error messages and 404s.
- The service-role client (`lib/supabase/admin.ts`) is only for setup and creating login accounts.

## 14. Money

Money is integer minor units everywhere. Format and parse only with `lib/money.ts`. Tax only with `lib/tax.ts`.

## 15. Touch

Screens used at the counter (Register) use at least 44px targets (`min-h-11`) and no hover-only actions.

## 16. Copy

Labels say what a thing does ("Add store", not "Submit"). Errors say what happened and what to do next. Run the `better-writing` skill on new screens.
