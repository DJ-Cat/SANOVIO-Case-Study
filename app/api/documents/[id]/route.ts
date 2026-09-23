import { NextResponse } from "next/server";
import { row } from "@/lib/db";

/** Serve the stored original of an uploaded document. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = row<{ filename: string; content_type: string | null; file_bytes: Uint8Array | null }>(
    `SELECT filename, content_type, file_bytes FROM source_documents WHERE id = ?`, id);
  if (!doc?.file_bytes) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(doc.file_bytes), {
    headers: {
      "content-type": doc.content_type || "application/octet-stream",
      "content-disposition": `attachment; filename="${doc.filename.replace(/"/g, "")}"`,
    },
  });
}
