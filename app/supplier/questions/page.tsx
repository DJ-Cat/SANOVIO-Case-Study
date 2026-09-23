import { redirect } from "next/navigation";

/** Questions now arrive, and are answered, in Messages. Old links land there. */
export default function Questions() {
  redirect("/supplier/messages");
}
