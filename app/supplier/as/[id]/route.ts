/**
 * Sign the supplier portal in as a given manufacturer.
 *
 * Deliberately not linked from anywhere in the UI — a real manufacturer has one
 * identity and no way to assume another. It exists so the demo can upload the
 * two real catalogues as their actual vendors; see the README.
 */
import { NextResponse } from "next/server";
import { SUPPLIER_COOKIE } from "@/lib/session";
import { row } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const org = row<{ id: string }>(
    `SELECT id FROM organizations WHERE id=? AND type='supplier' AND channel='manufacturer'`, id);
  if (!org) return new NextResponse(`No manufacturer ${id}`, { status: 404 });

  const res = NextResponse.redirect(new URL("/supplier", _req.url));
  res.cookies.set(SUPPLIER_COOKIE, org.id, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
