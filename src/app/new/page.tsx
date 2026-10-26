import type { Metadata } from "next";
import Link from "next/link";
import { CreateEvent } from "@/components/CreateEvent";
import { SILHOUETTES } from "@/lib/silhouettes";

export const metadata: Metadata = { title: "Create your aso ebi link" };

export default function NewEventPage() {
  return (
    <main className="mx-auto max-w-lg px-4 pb-20 pt-6">
      <Link href="/" className="font-display text-xl">
        AsoLink
      </Link>
      <h1 className="mt-8 font-display text-4xl leading-tight">Create your aso ebi link</h1>
      <p className="mt-3 text-ink-soft">
        Add the details and the fabric. You&apos;ll get one link for the WhatsApp group and a private page to track
        orders.
      </p>
      <CreateEvent silhouettes={SILHOUETTES} />
    </main>
  );
}
