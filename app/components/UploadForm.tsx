"use client";

import { useActionState, useEffect, useState } from "react";
import type { UploadOutcome } from "@/lib/workflow";
import { Stamp } from "./marks";
import { buttonClass } from "./controls";

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
    <form action={formAction} className="card space-y-4 p-3">
      {/* The drop target: the site's pale panel with lavender light, a
          dashed edge that turns brand blue once it holds a file. */}
      <label className={`panel block border-2 border-dashed px-6 py-10 text-center transition ${
        pending
          ? "cursor-not-allowed border-ink-100 opacity-60 dark:border-ink-700"
          : file ? "cursor-pointer border-brand-400"
          : "cursor-pointer border-ink-100 hover:border-brand-300 dark:border-ink-700"}`}>
        <span aria-hidden className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-white text-brand-600 shadow-[0_0_0_1px_rgb(87_89_242/0.10),0_8px_20px_-8px_rgb(87_89_242/0.45)] dark:bg-ink-900 dark:text-brand-300">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" /><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></svg>
        </span>
        {/* Disabled while the action runs: a file chosen mid-extraction would
            replace the label without replacing what is being extracted. */}
        <input type="file" name="file" accept={accept} required disabled={pending}
          className="sr-only"
          onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
        <div className="text-sm font-bold text-ink-800 dark:text-ink-100">
          Choose a file, or drop it here
        </div>
        <div className="mt-1 text-xs text-ink-400">{hint}</div>
        <div className={`mt-3 text-sm ${file ? "font-medium text-brand-600 dark:text-brand-300" : "text-ink-400"}`}>
          {file?.name ?? "No file chosen"}
        </div>
      </label>

      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Extracting…" : "Upload and extract"}
      </button>

      {pending && <Progress file={file} />}

      {/* The previous result is cleared while a new upload runs, so a stale
          success line is never read as this one's. */}
      {!pending && state && (
        <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${
          state.ok ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-rose-50 dark:bg-rose-500/10"}`} role={state.ok ? "status" : "alert"}>
          <Stamp tone={state.ok ? "good" : "danger"}>{state.ok ? "Extracted" : "Not read"}</Stamp>
          <div className="min-w-0">
            <div className="font-medium text-ink-900 dark:text-ink-50">{state.message}</div>
            {state.detail && <div className="mt-0.5 text-xs text-ink-500 dark:text-ink-300">{state.detail}</div>}
          </div>
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
