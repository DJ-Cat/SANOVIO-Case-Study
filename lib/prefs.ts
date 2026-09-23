/**
 * The reader's language and currency, for the request being rendered.
 *
 * Both are cookies, set from the portal chooser or the sidebar. With no
 * language chosen yet, the browser's own preference decides between the two
 * the platform has. Wrapped in React's `cache`, so the many components of one
 * page that ask get one answer and one rates lookup.
 */
import { cache } from "react";
import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, translator, type Locale, type Translate,
} from "./i18n";
import {
  CURRENCY_COOKIE, DEFAULT_CURRENCY, formatMoney, isCurrency, moneyParts,
  type Currency, type MoneyParts, type Rates,
} from "./currency";
import { exchangeRates } from "./rates";

export interface Prefs {
  locale: Locale; currency: Currency; rates: Rates; t: Translate;
  /** An amount stored in `from`, as the reader should see it. */
  money: (amount: number, from: string, digits?: number) => string;
  moneyParts: (amount: number, from: string, digits?: number) => MoneyParts;
}

export async function readLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  const accept = (await headers()).get("accept-language") ?? "";
  // The first language the browser names that the platform has.
  for (const part of accept.split(",")) {
    const tag = part.trim().slice(0, 2).toLowerCase();
    if (isLocale(tag)) return tag;
  }
  return DEFAULT_LOCALE;
}

export const getPrefs = cache(async (): Promise<Prefs> => {
  const locale = await readLocale();
  const c = (await cookies()).get(CURRENCY_COOKIE)?.value;
  const currency = isCurrency(c) ? c : DEFAULT_CURRENCY;
  const rates = await exchangeRates();
  return {
    locale, currency, rates, t: translator(locale),
    money: (amount, from, digits) => formatMoney(amount, from, currency, rates, digits),
    moneyParts: (amount, from, digits) => moneyParts(amount, from, currency, rates, digits),
  };
});
