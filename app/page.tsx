import Link from "next/link";
import { Camera, Images, QrCode, ShieldCheck } from "lucide-react";
import { BrandMark, Sparkle } from "@/components/Brand";
import { OpenEventButton } from "@/components/home/OpenEventButton";

export const metadata = { title: { absolute: "Gatherly — Capture Moments. Share Memories." } };

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const legacyKey = typeof sp.key === "string";

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,var(--color-sage-100),transparent_70%)]" />
      <header className="safe-top relative mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
        <BrandMark />
        <Link href="/admin" className="btn-ghost btn-sm">
          Host login
        </Link>
      </header>

      <main className="relative mx-auto max-w-5xl px-5 pb-16 sm:px-8">
        {legacyKey && (
          <div role="status" className="mx-auto mt-4 max-w-xl rounded-2xl border border-gold-300 bg-gold-100 px-4 py-3 text-sm text-gold-600">
            This event link is from an older version of Gatherly. Please ask your host for the event&apos;s new QR code or event code.
          </div>
        )}

        <section className="mx-auto max-w-2xl pt-14 text-center sm:pt-20">
          <p className="kicker">
            <Sparkle className="mr-2" />
            Event Moments
          </p>
          <h1 className="mt-5 font-serif text-[44px] leading-[1.05] font-semibold tracking-[-0.03em] text-ink sm:text-6xl">
            Capture Moments.
            <br />
            <span className="text-sage-600 italic">Share Memories.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-[17px] leading-relaxed text-stone-600">
            Welcome to Gatherly — a simple way to capture and share beautiful moments during your special events.
          </p>
          <div className="mx-auto mt-10 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <OpenEventButton />
            <Link href="/admin" className="btn-secondary w-full sm:w-auto">
              <ShieldCheck size={18} /> Admin Login
            </Link>
          </div>
          <p className="mt-5 text-sm text-stone-500">Guests: just scan the QR code at your event with your phone camera.</p>
        </section>

        <section className="mx-auto mt-20 grid max-w-4xl gap-4 sm:grid-cols-3">
          {[
            { icon: QrCode, title: "Scan", body: "Guests scan the event QR code — no app, no account." },
            { icon: Camera, title: "Snap", body: "Take photos right in the browser on iPhone or Android." },
            { icon: Images, title: "Share", body: "Every photo lands in the host's Google Drive and the shared gallery." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-6">
              <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-sage-100 text-sage-700">
                <Icon size={21} strokeWidth={1.8} />
              </div>
              <h2 className="font-serif text-xl font-semibold text-ink">{title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="safe-bottom pb-8 text-center text-xs text-stone-400">
        Made for moments worth keeping <Sparkle />
      </footer>
    </div>
  );
}
