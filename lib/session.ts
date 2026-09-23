/**
 * Portal identity.
 *
 * There is no authentication in this prototype, so who you are is resolved
 * server-side rather than chosen in the UI. That is deliberate: a manufacturer
 * only ever sees its own catalogue, demand and questions, so offering a list of
 * other manufacturers inside the portal would be modelling something that
 * cannot happen once real sign-in exists.
 */
import { cookies } from "next/headers";
import { row } from "./db";
import { HOSPITAL_ID, SUPPLIER_ID } from "./constants";

export const SUPPLIER_COOKIE = "sanovio_supplier";

export interface Org { id: string; name: string }

const MANUFACTURER =
  `SELECT id, name FROM organizations WHERE type='supplier' AND channel='manufacturer'`;

/**
 * The manufacturer whose workspace the supplier portal is showing.
 *
 * A deployment would read this from the session token. Here it is a cookie,
 * set by /supplier/as/<orgId>, and below that a chain of fallbacks whose order
 * matters: the configured default first, but only if that manufacturer has a
 * catalogue. Loading a frozen capture fills exactly one manufacturer, and if
 * it is not the configured one the portal opens on an empty workspace and
 * looks broken — the data is there, behind an identity nobody was told to
 * switch to.
 */
export async function currentSupplier(): Promise<Org | null> {
  const wanted = (await cookies()).get(SUPPLIER_COOKIE)?.value;
  const withCatalogue = `${MANUFACTURER} AND EXISTS (
      SELECT 1 FROM supplier_catalog_items s WHERE s.supplier_id = organizations.id)`;
  return (wanted ? row<Org>(`${MANUFACTURER} AND id=?`, wanted) : undefined)
    ?? row<Org>(`${withCatalogue} AND id=?`, SUPPLIER_ID)
    ?? row<Org>(`${withCatalogue} ORDER BY rowid LIMIT 1`)
    ?? row<Org>(`${MANUFACTURER} AND id=?`, SUPPLIER_ID)
    ?? row<Org>(`${MANUFACTURER} ORDER BY rowid LIMIT 1`)
    ?? null;
}


/** The hospital whose workspace the hospital portal is showing. */
export function currentHospital(): Org | null {
  return row<Org>(
    `SELECT id, name FROM organizations WHERE id=? AND type='hospital'`, HOSPITAL_ID) ?? null;
}
