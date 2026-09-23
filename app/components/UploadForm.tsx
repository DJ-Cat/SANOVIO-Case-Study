"use client";

import { useActionState, useEffect, useState } from "react";
import type { UploadOutcome } from "@/lib/workflow";

export function UploadForm({ action, accept, hint }: {
  action: (prev: UploadOutcome | null, fd: FormData) => Promise<UploadOutcome>;
  accept: string;
  hint: string;
}) {
  /**
   * The third element, not `useFormStatus().pending`.
   *
   * `useFormStatus` reports the *form submission*, which is over as soon as
   * the action has been handed to React — measured at 39ms against an upload
   * whose server action ran for 27 seconds. It is the wrong clock for work
   * that happens after the hand-off, which here is all of it.
   */
  const [state, formAction, pending] = useActionState(action, null);
  const [file, setFile] = useState<File | null>(null);

  return (
    <form action={formAction} className="card space-y-4 p-6">
      <label className={`block rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
        pending
          ? "cursor-not-allowed border-ink-100 opacity-60 dark:border-ink-700"
          : "cursor-pointer border-ink-100 hover:border-brand-300 hover:bg-brand-50/40 " +
            "dark:border-ink-700 dark:hover:border-brand-500/50 dark:hover:bg-brand-500/5"}`}>
        {/* Disabled while the action runs: a file chosen mid-extraction would
            replace the label without replacing what is being extracted. */}
        <input type="file" name="file" accept={accept} required disabled={pending}
          className="sr-only"
          onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
        <div className="text-sm font-semibold text-ink-700 dark:text-ink-100">
          Choose a file, or drop it here
        </div>
        <div className="mt-1 text-xs text-ink-400">{hint}</div>
        <div className="mt-3 text-sm font-medium text-brand-600 dark:text-brand-300">
          {file?.name ?? "No file chosen"}
        </div>
      </label>

      <button type="submit" disabled={pending}
        className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50">
        {pending ? "Extracting…" : "Upload and extract"}
      </button>

      {pending && <Progress file={file} />}

      {/* The previous result is cleared while a new upload runs, so a stale
          success line is never read as this one's. */}
      {!pending && state && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          state.ok
            ? "border-good-100 bg-good-100/30 text-good-500 dark:border-good-500/40 dark:bg-good-500/10 dark:text-good-100"
            : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"}`}>
          <div className="font-medium">{state.message}</div>
          {state.detail && <div className="mt-0.5 text-xs opacity-80">{state.detail}</div>}
        </div>
      )}
    </form>
  );
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * What the upload is doing, while it does it.
 *
 * The bar is indeterminate because there is nothing to make it determinate:
 * the extractor runs behind one blocking server action and reports no
 * progress, so any percentage would be decoration invented to look precise.
 * What is real is the clock and the shape of the work — and for a catalogue
 * PDF, which is minutes rather than seconds, those are the two things that
 * tell somebody the page has not simply hung.
 *
 * Mounted only while the action runs, so the timer starts and resets with it.
 */
function Progress({ file }: { file: File | null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(tick);
  }, []);

  const isPdf = /\.pdf$/i.test(file?.name ?? "");

  return (
    <div aria-live="polite" className="space-y-2">
      <div className="bar-indeterminate" role="progressbar" aria-busy="true"
        aria-label={isPdf ? "Extracting the catalogue" : "Parsing the file"} />
      <div className="flex items-baseline justify-between gap-4 text-xs text-ink-400">
        <span>
          {isPdf
            ? "Reading the catalogue page by page — figures, then one extraction call per page."
            : "Parsing the spreadsheet in-process."}
        </span>
        <span className="tnum shrink-0">{mmss(elapsed)}</span>
      </div>
      {isPdf && (
        <p className="text-xs text-ink-400">
          A 22-page catalogue takes about three minutes. The page waits for it — leaving now
          cancels the upload.
        </p>
      )}
    </div>
  );
}
