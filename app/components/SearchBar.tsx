import { Search } from "./icons";
import { getPrefs } from "@/lib/prefs";

/**
 * Manual product search — a GET form, so results are linkable and work
 * without JavaScript. A white rounded field that glows violet on focus, the
 * action in the site's gradient at its end.
 */
export async function SearchBar({ q, action = "/hospital" }: { q?: string; action?: string }) {
  const { t } = await getPrefs();
  return (
    <form action={action} role="search"
      className="flex items-center gap-2 rounded-2xl bg-[var(--sheet)] p-1.5 pl-4 shadow-[var(--shadow-glow)] transition-shadow focus-within:shadow-[var(--shadow-glow-strong)]">
      <Search className="h-4 w-4 shrink-0 text-ink-300" />
      <input
        id="product-search"
        name="q"
        defaultValue={q ?? ""}
        placeholder={t("Search in any language — a product, a kind of product, a maker, a GTIN or PZN")}
        aria-label={t("Search products")}
        className="min-w-0 flex-1 bg-transparent py-2 text-[0.95rem] text-ink-900 outline-none placeholder:text-ink-300 dark:text-ink-50"
      />
      <button type="submit" className="btn-gradient shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-white">
        {t("Search")}
      </button>
    </form>
  );
}
