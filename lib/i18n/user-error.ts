/**
 * A sentence meant for the person using the platform, kept translatable.
 *
 * The domain modules (workflow, replacement, messaging, ingest) are free of
 * Next and of the reader's language: they speak English. But a sentence with
 * a value spliced in — "Article number 300912 is already used…" — cannot be
 * looked up in the dictionary once it is built. So such a sentence travels as
 * its English template plus the values, and is filled in the reader's
 * language at the boundary (lib/actions.ts, or the page rendering it).
 *
 * `UserError.message` is the filled English, so logs, scripts/verify.ts and
 * any caller that only reads `.message` see exactly what they did before.
 */
import type { Translate, Vars } from ".";

export interface Message { text: string; vars?: Vars }

const fill = (text: string, vars?: Vars) => !vars ? text
  : text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

export const msg = (text: string, vars?: Vars): Message => ({ text, vars });

/** The English sentence, filled. */
export const english = (m: Message) => fill(m.text, m.vars);

export class UserError extends Error {
  readonly text: string;
  readonly vars?: Vars;
  constructor(text: string, vars?: Vars) {
    super(fill(text, vars));
    this.text = text;
    this.vars = vars;
  }
  static of(m: Message) { return new UserError(m.text, m.vars); }
}

/** An error as a translatable sentence: a UserError keeps its template; anything else its message. */
export function messageOf(e: unknown): Message {
  if (e instanceof UserError) return { text: e.text, vars: e.vars };
  return { text: e instanceof Error ? e.message : String(e) };
}

/** A message in the reader's language. */
export const say = (t: Translate, m: Message) => t(m.text, m.vars);
