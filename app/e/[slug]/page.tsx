import Link from "next/link";
import { CalendarDays, Camera, CloudOff, Images, Lock } from "lucide-react";
import { Sparkle } from "@/components/Brand";
import { EventGate } from "@/components/guest/EventGate";
import { GuestShell, StatusScreen } from "@/components/guest/GuestShell";
import { toPublicEvent } from "@/lib/services/access";
import { loadGuestPage } from "@/lib/services/guest-page";
import { formatEventDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Event", robots: { index: false, follow: false } };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ token?: string | string[] }> };

export default async function EventWelcomePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : null;
  const page = await loadGuestPage(slug);

  if (page.kind === "unavailable") {
    return (
      <StatusScreen icon={<CloudOff size={32} />} title="Almost ready">
        This event site is still being set up. Please check back in a little while.
      </StatusScreen>
    );
  }
  if (page.kind === "closed") {
    return (
      <StatusScreen icon={<Lock size={30} />} title="Not open right now">
        This event isn&apos;t accepting guests at the moment. Please check with your host.
      </StatusScreen>
    );
  }
  if (page.kind === "needs_access") {
    return (
      <GuestShell>
        <EventGate slug={slug} token={token} />
      </GuestShell>
    );
  }

  const event = toPublicEvent(page.event);
  const date = formatEventDate(event.date);

  return (
    <GuestShell>
      <section className="relative">
        {event.coverUrl ? (
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-sage-100">
            <img src={event.coverUrl} alt="" className="size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-ivory via-ivory/10 to-transparent" />
          </div>
        ) : (
          <div aria-hidden className="h-24 bg-[radial-gradient(ellipse_at_top,var(--color-sage-100),transparent_75%)]" />
        )}
        <div className={`relative px-6 text-center ${event.coverUrl ? "-mt-20" : "pt-4"}`}>
          <p className="kicker">
            <Sparkle className="mr-1.5" /> Welcome
          </p>
          <h2 className="mt-4 font-serif text-[40px] leading-[1.08] font-semibold tracking-[-0.02em] text-ink">{event.name}</h2>
          {date && (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-stone-500">
              <CalendarDays size={15} /> {date}
            </p>
          )}
          {event.description && <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed whitespace-pre-line text-stone-600">{event.description}</p>}
        </div>
      </section>

      <section className="mt-10 flex flex-col gap-3 px-6">
        {event.uploadsOpen ? (
          <Link href={`/e/${event.slug}/capture`} className="btn-primary py-5 text-base">
            <Camera size={21} /> Capture Moments
          </Link>
        ) : (
          <div className="rounded-2xl bg-sage-50 px-4 py-4 text-center text-sm text-sage-800">
            {event.status === "ended" ? "This event has ended — thank you for sharing your moments!" : "Photo uploads are paused right now."}
          </div>
        )}
        {event.galleryEnabled && (
          <Link href={`/e/${event.slug}/gallery`} className="btn-secondary py-4">
            <Images size={19} /> View Gallery
          </Link>
        )}
      </section>

      <section className="mx-6 mt-10 mb-6 rounded-3xl bg-sage-50 p-5">
        <h3 className="text-sm font-semibold text-ink">How it works</h3>
        <ol className="mt-3 space-y-2.5 text-sm text-stone-600">
          {["Tap Capture Moments and allow camera access.", "Snap a photo, check the preview, then tap Upload.", "Your photo goes straight to the host's private event album."].map((s, i) => (
            <li key={s} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-sage-700">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </section>
    </GuestShell>
  );
}
