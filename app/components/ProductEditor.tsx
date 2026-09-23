"use client";

import { useActionState, useState } from "react";
import type { ProductImage } from "@/lib/queries";
import type { EditOutcome } from "@/lib/actions";
import {
  saveProductDescription, uploadProductImage, removeProductImage,
} from "@/lib/actions";
import { Trash } from "./icons";

/**
 * The manufacturer's side of a product page.
 *
 * The picture and the description: the two things a catalogue PDF cannot
 * give up. Its photography belongs to a table rather than to a row, and its
 * prose describes a family of eight sizes. Everything else on the page was
 * read off the document and is shown, not edited.
 *
 * Price is the third such field and is deliberately not here — it is a ladder
 * rather than a number, and `TierEditor` owns it. Offering a single "base
 * price" box beside a hand-built ladder meant one control silently replacing
 * the other's work.
 *
 * Each panel saves on its own so a half-finished description cannot swallow
 * something else somebody did mean to set.
 */
export function ProductEditor({ canonicalId, images, description }: {
  canonicalId: string | null;
  images: ProductImage[];
  description: string | null;
}) {
  // Nothing here has anything to attach to until the row is a product.
  if (!canonicalId) {
    return (
      <div className="card grid aspect-square place-items-center p-6 text-center text-sm text-ink-400">
        Confirm this row to give it a product page you can price and photograph.
      </div>
    );
  }

  return (
    <>
      <Pictures canonicalId={canonicalId} images={images} />
      <DescriptionPanel canonicalId={canonicalId} description={description} />
    </>
  );
}

function Banner({ state }: { state: EditOutcome | null }) {
  if (!state) return null;
  return (
    <p className={`text-xs ${state.ok
      ? "text-good-500 dark:text-good-100"
      : "text-rose-700 dark:text-rose-300"}`}>
      {state.message}
    </p>
  );
}

function Pictures({ canonicalId, images }: { canonicalId: string; images: ProductImage[] }) {
  const [state, action, pending] = useActionState(uploadProductImage, null);
  const [chosen, setChosen] = useState<string | null>(null);
  const shot = images[0];

  return (
    <div className="card space-y-3 p-4">
      <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-xl border border-ink-50 bg-white dark:border-ink-700 dark:bg-ink-800">
        {shot ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={`/api/product-images/${shot.id}`} alt=""
            className="h-full w-full object-contain p-4" />
        ) : (
          <span className="text-xs text-ink-300">No picture yet</span>
        )}
      </div>

      {images.length > 0 && (
        <ul className="space-y-1.5">
          {images.map((img, i) => (
            <li key={img.id} className="flex items-center gap-2 text-[11px] text-ink-400">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/product-images/${img.id}`} alt=""
                className="h-8 w-8 shrink-0 rounded border border-ink-50 bg-white object-contain p-0.5 dark:border-ink-700 dark:bg-ink-800" />
              <span className="min-w-0 flex-1 truncate">
                {i === 0 && <span className="font-medium text-ink-500 dark:text-ink-300">shown · </span>}
                {img.confidence === "certain"
                  ? "supplied by you"
                  : `from your catalogue${img.page ? `, p.${img.page}` : ""} · ${img.confidence}`}
              </span>
              <form action={removeProductImage.bind(null, img.id)} className="shrink-0">
                <button title="Remove this picture"
                  className="rounded p-1 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40">
                  <Trash className="h-3.5 w-3.5" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="space-y-2 border-t border-ink-50 pt-3 dark:border-ink-800">
        <input type="hidden" name="canonicalId" value={canonicalId} />
        <label className="block cursor-pointer rounded-lg border border-dashed border-ink-100 px-3 py-2.5 text-center text-xs transition hover:border-brand-300 hover:bg-brand-50/40 dark:border-ink-700 dark:hover:border-brand-500/50">
          <input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only" disabled={pending}
            onChange={(e) => setChosen(e.currentTarget.files?.[0]?.name ?? null)} />
          <span className="font-medium text-ink-600 dark:text-ink-200">
            {chosen ?? "Add your own photograph"}
          </span>
        </label>
        {/* A picture from the company that makes the article outranks one the
            extractor matched to a table, which is why it is worth offering. */}
        <button type="submit" disabled={pending}
          className="w-full rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:bg-ink-25 disabled:opacity-40 dark:border-ink-600 dark:text-ink-200 dark:hover:bg-ink-800">
          {pending ? "Uploading…" : "Upload picture"}
        </button>
        <Banner state={state} />
      </form>
    </div>
  );
}

function DescriptionPanel({ canonicalId, description }: {
  canonicalId: string; description: string | null;
}) {
  const [state, action, pending] = useActionState(saveProductDescription, null);

  return (
    <form action={action} className="card space-y-2 p-4">
      <input type="hidden" name="canonicalId" value={canonicalId} />
      <label className="block text-xs font-semibold uppercase tracking-wide text-ink-400">
        Description
      </label>
      <textarea name="description" rows={5} defaultValue={description ?? ""} disabled={pending}
        placeholder="What this article is for, and anything a buyer should know before switching to it."
        className="w-full resize-y rounded-lg border border-ink-200 px-3 py-2 text-sm disabled:opacity-50 dark:border-ink-600 dark:bg-ink-950" />
      <p className="text-[11px] text-ink-400">
        Shown to hospitals on the product page. Extraction never fills this in — a catalogue
        describes a family, not a size.
      </p>
      <button type="submit" disabled={pending}
        className="w-full rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:bg-ink-25 disabled:opacity-40 dark:border-ink-600 dark:text-ink-200 dark:hover:bg-ink-800">
        {pending ? "Saving…" : "Save description"}
      </button>
      <Banner state={state} />
    </form>
  );
}
