import type { ProductImage } from "@/lib/queries";

/**
 * The image panel on a product page.
 *
 * Shows the manufacturer's own photography when extract_lib recovered it from
 * the catalogue PDF, and the product's ECLASS category as a drawing when it did
 * not. The two are never allowed to look alike: a drawing says so, and so does
 * a photograph the model was only guessing belonged to this SKU.
 */
export function ProductShot({ name, eclass, images = [] }: {
  name: string; eclass: string | null; images?: ProductImage[];
}) {
  const kind = categoryOf(eclass, name);
  const shot = images[0];

  // The site's feature tile: a rounded card holding a pale panel with the dot
  // grid and lavender light in its corner, the product sitting on it.
  const FRAME =
    "card relative grid aspect-square w-full lg:max-w-[22rem] place-items-center overflow-hidden p-2";

  if (!shot) {
    return (
      <figure className="lg:sticky lg:top-20">
        <ViewLabel>Category illustration</ViewLabel>
        <div className={FRAME}><div className="panel grid h-full w-full place-items-center"><Glyph kind={kind} /></div></div>
        <figcaption className="mt-2.5 lg:max-w-[22rem] text-[11px] leading-relaxed text-ink-400">
          No manufacturer image on file — this is the {LABEL[kind]} category, drawn from ECLASS
          {eclass ? ` ${eclass}` : ""}. Not a photograph of the article.
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className="lg:sticky lg:top-20">
      <ViewLabel>{shot.role === "shared" ? "Family photograph" : "Manufacturer photograph"}</ViewLabel>
      <div className={FRAME}>
        {/* White, not the dotted panel: catalogue photographs carry their own
            white ground, which would sit on the panel as a pasted box. */}
        <div className="grid h-full w-full place-items-center rounded-[0.875rem] bg-white">
          {/* Plain <img>: the bytes are served from the database, not the build. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/product-images/${shot.id}`} alt={name}
            className="h-full w-full object-contain p-6" />
        </div>
      </div>

      {images.length > 1 && (
        <div className="mt-2.5 flex lg:max-w-[22rem] flex-wrap gap-2">
          {images.slice(1, 5).map((img) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img key={img.id} src={`/api/product-images/${img.id}`} alt=""
              className="h-14 w-14 rounded-xl bg-white object-contain p-1 shadow-[var(--shadow-glow)]" />
          ))}
        </div>
      )}

      <figcaption className="mt-2.5 lg:max-w-[22rem] text-[11px] leading-relaxed text-ink-400">
        {shot.caption ? <span className="text-ink-500 dark:text-ink-300">{shot.caption}</span> : null}
        {shot.caption ? " · " : ""}
        From the manufacturer&apos;s catalogue
        {shot.page ? `, page ${shot.page}` : ""}
        {shot.region ? ` (${shot.region})` : ""}.
        {/* What the picture is of, before how sure we are it is the right one.
            A family shot is not a photograph of this size, and the page has to
            say so even when the model was confident it belongs to the table. */}
        {shot.role === "shared" && (
          <span className="mt-1 block font-medium text-ink-500 dark:text-ink-300">
            Shows the product family, not this size specifically.
          </span>
        )}
        {shot.confidence !== "certain" && (
          <span className="mt-1 block font-medium text-amber-700 dark:text-amber-400">
            {shot.confidence === "likely"
              ? "Matched to this article by layout, not by a caption."
              : "Uncertain match — confirm this is the right article before ordering."}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** What the picture is, above it. */
function ViewLabel({ children }: { children: React.ReactNode }) {
  return <div className="label mb-2">{children}</div>;
}

type Kind = "cannula" | "syringe" | "infusion" | "glove" | "mask" | "wound" | "disinfectant" | "generic";

const LABEL: Record<Kind, string> = {
  cannula: "cannula", syringe: "syringe", infusion: "infusion set", glove: "glove",
  mask: "mask", wound: "wound care", disinfectant: "disinfectant", generic: "consumable",
};

function categoryOf(eclass: string | null, name: string): Kind {
  const byCode: Record<string, Kind> = {
    "34110301": "cannula", "34110201": "syringe", "34110401": "infusion",
    "34120101": "glove", "34120201": "mask", "34130101": "wound", "34140101": "disinfectant",
  };
  if (eclass && byCode[eclass]) return byCode[eclass];
  const n = name.toLowerCase();
  if (/kanüle|kanuele|needle|microlance|sterican/.test(n)) return "cannula";
  if (/spritze|syringe|plastipak|discardit|injekt|omnifix/.test(n)) return "syringe";
  if (/infusion|überleit|ueberleit|pump/.test(n)) return "infusion";
  if (/handschuh|glove/.test(n)) return "glove";
  if (/maske|mask/.test(n)) return "mask";
  if (/wund|verband|pflaster/.test(n)) return "wound";
  if (/desinfekt|wipe/.test(n)) return "disinfectant";
  return "generic";
}

function Glyph({ kind }: { kind: Kind }) {
  const stroke = "text-brand-500/70 dark:text-brand-300/70";
  const fill = "text-brand-500/12 dark:text-brand-300/15";
  const common = { fill: "none", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  return (
    <svg viewBox="0 0 120 120" className="h-2/5 w-2/5" aria-hidden>
      <g className={fill} fill="currentColor">
        <circle cx="60" cy="60" r="56" />
      </g>
      <g className={stroke} stroke="currentColor" {...common}>
        {kind === "cannula" && (
          <>
            <path d="M22 84 L64 42" /><path d="M56 34 L78 56 L64 70 L42 48 Z" />
            <path d="M78 56 L96 38" /><path d="M86 30 L98 42" />
          </>
        )}
        {kind === "syringe" && (
          <>
            <rect x="30" y="46" width="52" height="28" rx="4" />
            <path d="M82 60 L102 60" /><path d="M30 52 L18 52 L18 68 L30 68" />
            <path d="M44 46 L44 74" /><path d="M58 46 L58 74" />
          </>
        )}
        {kind === "infusion" && (
          <>
            <path d="M44 20 L76 20 L76 52 Q60 72 44 52 Z" />
            <path d="M60 68 L60 92" /><circle cx="60" cy="100" r="8" />
          </>
        )}
        {kind === "glove" && (
          <>
            <path d="M38 100 L38 52 q0-10 8-10 t8 10 v-14 q0-10 8-10 t8 10 v14 q0-8 7-8 t7 8 v10 q10 2 10 12 v26 Z" />
          </>
        )}
        {kind === "mask" && (
          <>
            <path d="M28 46 q32-12 64 0 v18 q0 24-32 30 -32-6-32-30 Z" />
            <path d="M28 52 L14 62" /><path d="M92 52 L106 62" />
          </>
        )}
        {kind === "wound" && (
          <>
            <rect x="24" y="44" width="72" height="32" rx="16" transform="rotate(-20 60 60)" />
            <path d="M50 50 L70 70" /><path d="M70 50 L50 70" />
          </>
        )}
        {kind === "disinfectant" && (
          <>
            <path d="M46 34 L74 34 L74 46 q14 8 14 24 v28 q0 8-8 8 H54 q-8 0-8-8 V58 q0-16 14-24 Z" />
            <path d="M54 22 L66 22" />
          </>
        )}
        {kind === "generic" && (
          <>
            <path d="M28 44 L60 28 L92 44 L92 78 L60 94 L28 78 Z" />
            <path d="M28 44 L60 60 L92 44" /><path d="M60 60 L60 94" />
          </>
        )}
      </g>
    </svg>
  );
}
