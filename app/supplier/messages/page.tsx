import { Empty } from "@/app/components/ui";
import { Messenger } from "@/app/components/Messenger";
import { conversations, thread, inboxStamp } from "@/lib/messaging";
import { currentSupplier } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The manufacturer's inbox: one conversation per hospital that wrote to it.
 * A hospital's questions arrive in it as cards naming the product, and are
 * answered there — this replaced a separate Questions page, which listed the
 * same questions without the conversation around them.
 */
export default async function Messages(
  { searchParams }: { searchParams: Promise<{ h?: string }> },
) {
  const me = await currentSupplier();
  if (!me) return <Empty>No manufacturer is signed in.</Empty>;

  const { h } = await searchParams;
  const list = conversations("supplier", me.id);
  // Only a hospital that wrote to this manufacturer can be opened here.
  const named = h && list.some((c) => c.hospitalId === h) ? h : null;
  const activeId = named ?? list[0]?.hospitalId ?? null;

  return (
    <Messenger side="supplier" basePath="/supplier/messages" paramKey="h"
      conversations={list} activeId={activeId} explicit={Boolean(named)}
      thread={activeId ? thread("supplier", activeId, me.id) : null}
      stamp={inboxStamp("supplier", me.id)} />
  );
}
