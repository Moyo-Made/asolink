import Image from "next/image";
import Link from "next/link";

const steps = [
  ["Upload the fabric", "Shoot the ankara, lace or aso oke flat, then pick a cut: kaftan, fitted gown or long gown. Or upload a photo of the sewn outfit."],
  ["Drop one link in the group", "Guests open it on their phones. No app, no sign-up."],
  ["Guests see it on themselves", "They take a photo and see the aso ebi on their own body in about 30 seconds."],
  ["Orders arrive on WhatsApp", "Each guest picks a size and sends you a ready-written order. Your tracker counts the sizes to sew."],
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6">
      <header className="flex items-center justify-between">
        <span className="font-display text-xl">AsoLink</span>
        <Link href="/new" className="text-sm font-semibold underline underline-offset-4">
          Create a link
        </Link>
      </header>

      <section className="mt-10 grid items-center gap-10 md:grid-cols-[1fr_minmax(0,420px)]">
        <div>
          <h1 className="font-display text-[3.1rem] leading-[0.98] sm:text-7xl">One link for your aso ebi.</h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-soft">
            Share it in the family WhatsApp group. Guests see the fabric on themselves, pick their size, and order from
            you on WhatsApp.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/new" className="flex h-13 items-center rounded-lg bg-ink px-6 font-semibold text-white">
              Create your link
            </Link>
            {process.env.NEXT_PUBLIC_DEMO_SLUG && (
              <Link
                href={`/e/${process.env.NEXT_PUBLIC_DEMO_SLUG}`}
                className="flex h-13 items-center rounded-lg border-2 border-ink px-6 font-semibold"
              >
                Try the demo event
              </Link>
            )}
          </div>
        </div>

        <figure className="relative">
          <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-wash">
            <Image
              src="/demo/after.webp"
              alt="A wedding guest wearing a wine lace kaftan, generated from her own photo and the fabric"
              fill
              priority
              sizes="(max-width: 768px) 100vw, 420px"
              className="object-cover"
            />
            <span className="absolute left-3 top-3 rounded bg-ink/85 px-2.5 py-1 text-xs font-semibold text-white">
              Visual preview, not a fit guarantee
            </span>
          </div>
          <div className="label-card absolute -bottom-6 -left-2 flex gap-3 bg-paper p-3 sm:-left-8">
            {[
              ["/demo/before.webp", "Her photo"],
              ["/demo/fabric.webp", "The lace"],
            ].map(([src, label]) => (
              <div key={src} className="w-20">
                <Image src={src} alt={label} width={80} height={100} className="h-24 w-20 rounded object-cover object-top" />
                <p className="mt-1 text-xs font-semibold">{label}</p>
              </div>
            ))}
          </div>
        </figure>
      </section>

      <section className="mt-24" aria-labelledby="how">
        <h2 id="how" className="font-display text-3xl">
          How it works
        </h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([title, body], i) => (
            <li key={title} className="border-t-2 border-ink pt-4">
              <span className="font-display text-2xl text-marigold">{i + 1}</span>
              <h3 className="mt-1 font-semibold">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-24 grid gap-4 sm:grid-cols-[1fr_1fr_1.2fr] sm:items-end">
        <Image src="/demo/after-2.webp" alt="A guest in a kente kaftan" width={480} height={640} className="w-full rounded-lg" />
        <Image src="/demo/after-3.webp" alt="A guest in an ankara shirt, from a selfie" width={480} height={640} className="w-full rounded-lg" />
        <div className="sm:pl-4">
          <h2 className="font-display text-3xl leading-tight">Works with the photos people already have</h2>
          <p className="mt-3 leading-relaxed text-ink-soft">
            A selfie shows the top. A photo from head to knees shows the whole outfit. Photos are compressed on the
            phone before upload, so it works on slow data.
          </p>
        </div>
      </section>

      <footer className="mt-24 border-t border-line pt-6 text-sm text-ink-soft">
        <p>
          Try-on previews are made with the YouCam AI Clothes Virtual Try-On API by Perfect Corp. Every preview is a
          visual guide, not a fit guarantee.
        </p>
      </footer>
    </main>
  );
}
