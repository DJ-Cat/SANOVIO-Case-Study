import { Messenger } from "@/app/components/Messenger";
import { conversations, thread, inboxStamp, manufacturersToWrite } from "@/lib/messaging";
import { HOSPITAL_ID } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * The hospital's side of the same conversations: one per manufacturer. The
 * questions it sent from a product or a recommendation are here with their
 * answers, and it can write to any manufacturer that has products on the
 * platform, not only the ones it already asked something.
 */
export default async function HospitalMessages(
  { searchParams }: { searchParams: Promise<{ s?: string }> },
) {
  const { s } = await searchParams;
  const list = conversations("hospital", HOSPITAL_ID);
  const writable = manufacturersToWrite();
  const named = s && (list.some((c) => c.supplierId === s) || writable.some((m) => m.id === s)) ? s : null;
  const activeId = named ?? list[0]?.supplierId ?? null;

  return (
    <Messenger side="hospital" basePath="/hospital/messages" paramKey="s"
      conversations={list} activeId={activeId} explicit={Boolean(named)}
      thread={activeId ? thread("hospital", HOSPITAL_ID, activeId) : null}
      stamp={inboxStamp("hospital", HOSPITAL_ID)} manufacturers={writable} />
  );
}
