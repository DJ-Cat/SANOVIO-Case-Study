/**
 * §2 of the structure doc: three thresholds, not one.
 *
 * Extraction confidence and equivalence confidence have different
 * distributions and very different costs of error. A misread price is
 * recoverable; a wrong substitution on an implantable is a patient-safety
 * and MDR liability event. So they are tuned independently, and the
 * substitution bar is weighted by MDR risk class.
 */

export type MdrClass = "I" | "IIa" | "IIb" | "III";

/** "Did we read this row correctly?" — wrong number shown; recoverable. */
export const EXTRACTION_THRESHOLD = 90;

/** "Is this row the same article as this canonical product?" — wrong product ordered. */
export const LINK_THRESHOLD = 95;

/**
 * "Are these two *different* articles clinically interchangeable?"
 * null = never auto-confirm, regardless of model confidence.
 */
export const SUBSTITUTION_THRESHOLD: Record<MdrClass, number | null> = {
  I: 90,
  IIa: 95,
  IIb: 98,
  III: null,
};

export const RISK_LABEL: Record<MdrClass, string> = {
  I: "Class I — low risk",
  IIa: "Class IIa — medium risk",
  IIb: "Class IIb — high risk",
  III: "Class III — highest risk",
};

/** Class IIb and III substitutions need a clinician, not just a budget holder. */
export function requiresClinicalReview(type: "identity" | "substitution", cls: MdrClass): boolean {
  if (type === "identity") return false; // same article, different channel: no clinical decision
  return cls === "IIb" || cls === "III";
}

export function substitutionAutoConfirms(cls: MdrClass, confidence: number): boolean {
  const t = SUBSTITUTION_THRESHOLD[cls];
  if (t === null) return false;
  return confidence >= t;
}

export function normaliseMdr(raw: string | null | undefined): MdrClass {
  const v = (raw ?? "").trim().replace(/^Klasse\s*/i, "").replace(/\s+/g, "");
  if (v === "I" || v === "1") return "I";
  if (/^(IIa|2a)$/i.test(v)) return "IIa";
  if (/^(IIb|2b)$/i.test(v)) return "IIb";
  if (/^(III|3)$/i.test(v)) return "III";
  return "IIa"; // conservative default: never silently treat an unknown as Class I
}
