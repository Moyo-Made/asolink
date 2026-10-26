import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 pt-24">
      <h1 className="font-display text-4xl">This link doesn&apos;t lead anywhere</h1>
      <p className="mt-3 text-ink-soft">
        Check that you copied the whole link from the WhatsApp message. If it still doesn&apos;t work, ask the
        coordinator to send it again.
      </p>
      <Link href="/" className="mt-8 inline-block font-semibold underline underline-offset-4">
        Go to AsoLink
      </Link>
    </main>
  );
}
