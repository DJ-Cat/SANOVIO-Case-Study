/**
 * The platform's two languages.
 *
 * English is written in the code, where it always was, and is the key: a
 * German reader gets the dictionary's entry for that exact sentence, and the
 * English one when there is none yet. So a string nobody translated reads in
 * English rather than as a missing-key placeholder, and the code stays
 * readable in the language it was written in.
 *
 * Pure and dependency-free, so server pages and client components share it.
 * Product data — names, specifications, a manufacturer's description — is
 * never run through it: that is the catalogue's own language.
 */
import { DE } from "./de";

export type Locale = "en" | "de";
export const LOCALES: { id: Locale; label: string; name: string }[] = [
  { id: "en", label: "EN", name: "English" },
  { id: "de", label: "DE", name: "Deutsch" },
];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "sanovio_lang";

export const isLocale = (v: unknown): v is Locale => v === "en" || v === "de";

export type Vars = Record<string, string | number>;
export type Translate = (text: string, vars?: Vars) => string;

/** `{name}` placeholders, filled after the lookup so both languages share them. */
function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function translate(locale: Locale, text: string, vars?: Vars): string {
  return fill(locale === "de" ? (DE[text] ?? text) : text, vars);
}

export const translator = (locale: Locale): Translate =>
  (text, vars) => translate(locale, text, vars);

/** Pick between two phrasings that do not fit one sentence template, e.g. with markup inside. */
export const pick = <T,>(locale: Locale, en: T, de: T): T => (locale === "de" ? de : en);

/** "1 point" / "3 points", in either language: pass both English forms, each is looked up. */
export function plural(t: Translate, n: number, one: string, many: string, vars?: Vars): string {
  return t(n === 1 ? one : many, { n, ...vars });
}
