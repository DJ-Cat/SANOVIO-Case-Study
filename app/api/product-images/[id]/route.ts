import { NextResponse } from "next/server";
import { row } from "@/lib/db";

/** Serve one stored product figure. Immutable: the bytes never change in place. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const img = row<{ content_type: string; image_bytes: Uint8Array | null }>(
    `SELECT content_type, image_bytes FROM product_images WHERE id = ?`, id);
  if (!img?.image_bytes) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(img.image_bytes), {
    headers: {
      "content-type": img.content_type,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
