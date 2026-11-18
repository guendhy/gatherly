import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/AdminShell";
import { EventForm } from "@/components/admin/EventForm";
import { CoverUploader, DriveFolderSettings } from "@/components/admin/EventStorageSettings";
import { getStorageStatus } from "@/lib/google/connection";
import { UUID_RE } from "@/lib/request";
import * as repo from "@/lib/repo";
import { toPublicEvent } from "@/lib/services/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Event settings" };

export default async function EventSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [event, storage] = await Promise.all([repo.getEventById(id), getStorageStatus()]);
  if (!event) notFound();
  const pub = toPublicEvent(event);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Event settings" subtitle={event.event_name} back={{ href: `/admin/events/${id}`, label: event.event_name }} />
      <div className="grid gap-5 md:grid-cols-[1fr_300px]">
        <EventForm
          mode="edit"
          eventId={id}
          initial={{
            event_name: event.event_name,
            description: event.description ?? "",
            event_date: event.event_date ?? "",
            cover_image_url: event.cover_image_url ?? "",
            upload_enabled: event.upload_enabled,
            gallery_enabled: event.gallery_enabled,
          }}
        />
        <div className="space-y-5">
          <CoverUploader eventId={id} hasCover={Boolean(event.cover_drive_file_id || event.cover_image_url)} coverUrl={pub.coverUrl} />
          <DriveFolderSettings eventId={id} folderId={event.google_drive_folder_id} storageConnected={storage.connected} />
        </div>
      </div>
    </div>
  );
}
