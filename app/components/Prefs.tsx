"use client";

import { createContext, useContext, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOCALES, translator, type Locale, type Translate } from "@/lib/i18n";
import {
  CURRENCIES, FALLBACK_RATES, formatMoney, moneyParts,
  type Currency, type MoneyParts, type Rates,
} from "@/lib/currency";
import { setPreferences } from "@/lib/actions";

/**
 * The reader's language and currency, handed from the root layout to every
 * client component — the client-side half of `lib/prefs.ts`.
 */

interface ClientPrefs {
  locale: Locale; currency: Currency; rates: Rates; t: Translate;
  money: (amount: number, from: string, digits?: number) => string;
  moneyParts: (amount: number, from: string, digits?: number) => MoneyParts;
}

const Ctx = createContext<ClientPrefs>(build("en", "CHF", FALLBACK_RATES));

function build(locale: Locale, currency: Currency, rates: Rates): ClientPrefs {
  return {
    locale, currency, rates, t: translator(locale),
    money: (a, f, d) => formatMoney(a, f, currency, rates, d),
    moneyParts: (a, f, d) => moneyParts(a, f, currency, rates, d),
  };
}

export function PrefsProvider({ locale, currency, rates, children }: {
  locale: Locale; currency: Currency; rates: Rates; children: React.ReactNode;
}) {
  const value = useMemo(() => build(locale, currency, rates), [locale, currency, rates]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePrefs = () => useContext(Ctx);

/**
 * An amount, in the reader's currency. A converted figure is marked "≈" and
 * names the stored amount and the rate's date on hover, so an estimate is
 * never mistaken for a quote. Usable from server and client components alike.
 */
export function Money({ amount, from, digits, className }: {
  amount: number; from: string; digits?: number; className?: string;
}) {
  const { moneyParts: parts, rates, t } = usePrefs();
  const m = parts(amount, from, digits);
  if (!m.approx) return <span className={className}>{m.code} {m.text}</span>;
  return (
    <span className={className}
      title={t("{original}, converted at the {source} rate of {date}", {
        original: m.original, date: rates.date,
        source: rates.source === "ecb" ? t("ECB reference") : t("approximate"),
      })}>
      ≈ {m.code} {m.text}
    </span>
  );
}

/** The two switches: language and display currency. */
export function PrefsSwitch({ compact = false }: { compact?: boolean }) {
  const { locale, currency, t } = usePrefs();
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (p: { locale?: Locale; currency?: Currency }) => start(async () => {
    await setPreferences(p);
    router.refresh();
  });

  const pill = (on: boolean) => `rounded-lg px-2.5 py-1 font-semibold transition ${on
    ? "bg-white text-ink-950 shadow-[0_0_0_1px_rgb(87_89_242/0.10),0_2px_8px_-2px_rgb(40_42_120/0.18)] dark:bg-ink-800 dark:text-white"
    : "text-ink-500 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50"}`;

  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs ${pending ? "opacity-60" : ""} ${compact ? "" : "justify-center"}`}>
      <div className="inline-flex gap-0.5 rounded-xl bg-ink-50 p-0.5 dark:bg-ink-900" role="group" aria-label={t("Language")}>
        {LOCALES.map((l) => (
          <button key={l.id} type="button" title={l.name} disabled={pending}
            aria-pressed={locale === l.id} onClick={() => save({ locale: l.id })} className={pill(locale === l.id)}>
            {l.label}
          </button>
        ))}
      </div>
      <label className="inline-flex items-center gap-1.5">
        <span className="sr-only">{t("Currency")}</span>
        <select value={currency} disabled={pending} aria-label={t("Currency")}
          onChange={(e) => save({ currency: e.target.value as Currency })}
          className="rounded-xl border-0 bg-ink-50 py-1.5 pl-2.5 pr-7 font-semibold text-ink-700 outline-none ring-brand-300 focus:ring-2 dark:bg-ink-900 dark:text-ink-100">
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      {!compact && currency !== "CHF" && (
        <span className="w-full text-center text-[11px] text-ink-400">
          {t("Prices are converted at the day's reference rate — an estimate, not a quote.")}
        </span>
      )}
    </div>
  );
}
