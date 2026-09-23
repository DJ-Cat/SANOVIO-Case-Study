import { Search } from "./icons";

/** Manual product search — a GET form, so results are linkable and work without JS. */
export function SearchBar({ q, action = "/hospital" }: { q?: string; action?: string }) {
  return (
    <form action={action} className="relative">
      <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
      <input
        name="q"
        defaultValue={q ?? ""}
        placeholder="Search products in any language — name, kind, maker, GTIN or PZN"
        aria-label="Search product"
        className="w-full rounded-full border border-ink-100 bg-white/85 py-3.5 pl-12 pr-28 text-sm shadow-[0_1px_2px_rgba(16,18,40,.04),0_8px_24px_-12px_rgba(16,18,40,.12)] outline-none backdrop-blur transition placeholder:text-ink-300 focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-ink-700 dark:bg-ink-900/80 dark:placeholder:text-ink-400"
      />
      <button type="submit"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600">
        Search
      </button>
    </form>
  );
}
