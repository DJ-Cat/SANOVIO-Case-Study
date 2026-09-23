/** Demo identities. A real deployment resolves these from the session. */
export const HOSPITAL_ID = "org_h1";
export const BUYER = "usr_buyer";
export const APPROVER = "usr_appr";
export const CLINICAL = "usr_clin";

/**
 * The manufacturer signed in to the supplier portal. A supplier is the company
 * itself, so the portal is one company's workspace and never lists the others —
 * the same way the hospital portal is pinned to HOSPITAL_ID.
 */
export const SUPPLIER_ID = "org_bbraun";

/** A replacement analysis still "running" after this long was cut off — a restart, a crash. */
export const STALE_RUN_MS = 15 * 60_000;
