import Link from "next/link";
import { redirect } from "next/navigation";
import { CameraOff } from "lucide-react";
import { CaptureFlow } from "@/components/guest/CaptureFlow";
import { GuestShell, StatusScreen } from "@/components/guest/GuestShell";
import { getUploadMaxBytes } from "@/lib/env";
import { uploadsOpen } from "@/lib/services/access";
import { loadGuestPage } from "@/lib/services/guest-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Capture", robots: { index: false, follow: false } };

export default async function CapturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await loadGuestPage(slug);
  if (page.kind !== "ok") redirect(`/e/${slug}`);
  const { event } = page;

  if (!uploadsOpen(event)) {
    return (
      <StatusScreen
        icon={<CameraOff size={30} />}
        title={event.status === "ended" ? "Event has ended" : "Uploads paused"}
        action={
          <Link href={`/e/${slug}`} className="btn-secondary w-full">
            Back to event
          </Link>
        }
      >
        {event.status === "ended" ? "This event is no longer accepting photos. Thank you for celebrating!" : "The host has paused photo uploads for now. Please try again a little later."}
      </StatusScreen>
    );
  }

  return (
    <GuestShell back={`/e/${slug}`} title={event.event_name}>
      <CaptureFlow slug={slug} eventName={event.event_name} galleryEnabled={event.gallery_enabled} maxBytes={getUploadMaxBytes()} />
    </GuestShell>
  );
}
