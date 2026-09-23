/*
 * The platform's controls, in a module with no server imports so client
 * components draw the same buttons the server pages do.
 */

/**
 * Buttons as sanovio.de draws them: rounded, the primary in the site's
 * blue-to-violet gradient with a soft glow, the secondary a white chip with
 * the faintest edge.
 */
export const BUTTON = {
  primary: "btn-gradient text-white disabled:text-ink-400",
  ghost: "bg-white text-ink-700 shadow-[0_0_0_1px_var(--line-strong),0_1px_2px_rgb(20_21_40/0.04)] hover:text-brand-700 hover:shadow-[0_0_0_1px_var(--color-brand-200),0_4px_14px_-4px_rgb(87_89_242/0.30)] active:bg-ink-25 dark:bg-ink-900 dark:text-ink-100 dark:hover:text-brand-200",
  danger: "bg-white text-rose-700 shadow-[0_0_0_1px_var(--color-rose-200),0_1px_2px_rgb(20_21_40/0.04)] hover:bg-rose-50 dark:bg-ink-900 dark:text-rose-300 dark:shadow-[0_0_0_1px_rgb(244_63_94/0.35)] dark:hover:bg-rose-500/10",
} as const;

export const buttonClass = (variant: keyof typeof BUTTON = "primary", size: "sm" | "md" = "md") =>
  `inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${
    size === "sm" ? "rounded-lg px-3 py-1.5 text-xs" : "rounded-xl px-4 py-2 text-sm"} ${BUTTON[variant]}`;

/** A dialog: a rounded white card lifted over a blurred, dimmed page. */
export const DIALOG = {
  scrim: "fixed inset-0 z-50 grid place-items-center bg-ink-950/35 p-4 backdrop-blur-[3px]",
  panel: "w-full max-w-md overflow-hidden rounded-3xl bg-[var(--sheet)] shadow-[0_0_0_1px_rgb(87_89_242/0.12),0_30px_80px_-20px_rgb(40_42_120/0.45)]",
  head: "px-6 pt-6",
  body: "px-6 pt-2 pb-2 text-sm leading-relaxed text-ink-500 dark:text-ink-300",
  foot: "flex justify-end gap-2 px-6 pb-6 pt-4",
};
