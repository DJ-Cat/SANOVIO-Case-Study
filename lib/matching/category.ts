/**
 * Placeholder product categories, derived from names.
 *
 * Shared by the importer (a catalogue row with no stated ECLASS gets one),
 * the suggestion pipeline (stage 1 buckets on it) and search (the category is
 * written into each product's embedding text in German and English, so a
 * query in either reaches it).
 */
/**
 * ECLASS-style category. Placeholder codes: production should carry real
 * ECLASS, which is what the DACH market already classifies against.
 *
 * Exported because the suggestion pipeline's first stage buckets on it, and
 * applies it to *both* sides — a category derived from a hospital's free text
 * is only comparable with one derived the same way from a catalogue name, not
 * with a code a catalogue happened to state.
 */
export const UNCLASSIFIED = "34199999";
export function eclassFor(name: string, attrs: Record<string, string | number>): string {
  const n = name.toLowerCase();
  // Before the gauge/volume shortcuts: an implant or a urine cup can carry a
  // size in mm or a volume in ml without being a needle or a syringe.
  if (/implantat|implant|hüft|hueft|pfanne|stent/.test(n)) return "34210101";
  if (/beatmung|ventilat|tubus/.test(n)) return "34110601";
  if (/urinbecher|becher|probengef/.test(n)) return "34150101";
  if (attrs.gauge || /kanüle|kanuele|needle|microlance|sterican/.test(n)) return "34110301";
  if (attrs.volume_ml || /spritze|syringe|plastipak|discardit|injekt|omnifix/.test(n)) return "34110201";
  if (/infusion|überleit|ueberleit|intrafix|alaris/.test(n)) return "34110401";
  if (/handschuh|glove/.test(n)) return "34120101";
  if (/maske|mask/.test(n)) return "34120201";
  if (/wund|verband|pflaster/.test(n)) return "34130101";
  if (/desinfekt|wipe/.test(n)) return "34140101";
  return UNCLASSIFIED;
}

/** What a placeholder category code stands for, for a reason a human reads. */
export const CATEGORY_LABEL: Record<string, string> = {
  "34110201": "syringe", "34110301": "needle", "34110401": "infusion set",
  "34110501": "pump set", "34110601": "ventilation", "34120101": "glove",
  "34120201": "mask", "34130101": "wound care", "34140101": "disinfection",
  "34150101": "specimen container", "34210101": "implant", [UNCLASSIFIED]: "unclassified",
};


/**
 * The category in German, the language the catalogues are written in. Paired
 * with the English label in embedding text: a buyer typing "needle", "Kanüle"
 * or "aiguille" should land on the same products, and an explicit bilingual
 * term gives the embedding model something to hold on to beside a brand name.
 */
export const CATEGORY_LABEL_DE: Record<string, string> = {
  "34110201": "Spritze", "34110301": "Kanüle", "34110401": "Infusionsbesteck",
  "34110501": "Überleitgerät", "34110601": "Beatmung", "34120101": "Handschuh",
  "34120201": "Maske", "34130101": "Wundversorgung", "34140101": "Desinfektion",
  "34150101": "Probengefäß", "34210101": "Implantat", [UNCLASSIFIED]: "",
};
