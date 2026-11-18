import Link from "next/link";
import { redirect } from "next/navigation";
import { EyeOff } from "lucide-react";
import { Gallery } from "@/components/guest/Gallery";
import { GuestShell, StatusScreen } from "@/components/guest/GuestShell";
import { uploadsOpen } from "@/lib/services/access";
import { loadGuestPage } from "@/lib/services/guest-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gallery", robots: { index: false, follow: false } };

export default async function GalleryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await loadGuestPage(slug);
  if (page.kind !== "ok") redirect(`/e/${slug}`);
  const { event } = page;

  if (!event.gallery_enabled) {
    return (
      <StatusScreen
        icon={<EyeOff size={30} />}
        title="Gallery is private"
        action={
          <Link href={`/e/${slug}`} className="btn-secondary w-full">
            Back to event
          </Link>
        }
      >
        The host has chosen to keep this event&apos;s photos private. Your uploads still go straight to their album.
      </StatusScreen>
    );
  }

  return (
    <GuestShell back={`/e/${slug}`} title={event.event_name}>
      <Gallery slug={slug} uploadsOpen={uploadsOpen(event)} />
    </GuestShell>
  );
}
