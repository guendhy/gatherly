import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FolderOpen, QrCode, Settings } from "lucide-react";
import { AdminPhotoGrid } from "@/components/admin/AdminPhotoGrid";
import { PageHeader, StatusChip } from "@/components/admin/AdminShell";
import { EventControls, ReconcileButton } from "@/components/admin/EventControls";
import { formatEventDate, formatRelative } from "@/lib/format";
import { UUID_RE } from "@/lib/request";
import * as repo from "@/lib/repo";
import { emptyStats } from "@/lib/services/admin-events";

export const dynamic = "force-dynamic";

const LOG_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  failed: "Failed",
  duplicate_skipped: "Duplicate skipped",
  recorded_failed: "Saved to Drive, DB write failed",
  reconciled: "Repaired by sync",
};

export default async function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const event = await repo.getEventById(id);
  if (!event) notFound();
  const [statsMap, photos, logs] = await Promise.all([repo.getEventStats([id]), repo.listAllPhotos(id, 120), repo.listUploadLogs(id, 40)]);
  const stats = statsMap[id] ?? emptyStats(id);

  return (
    <>
      <PageHeader
        back={{ href: "/admin", label: "Events" }}
        title={event.event_name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusChip status={event.status} /> {formatEventDate(event.event_date) ?? "No date"} · <code className="text-xs">/e/{event.event_slug}</code>
          </span>
        }
        actions={
          <>
            <Link href={`/admin/events/${id}/settings`} className="btn-secondary btn-sm">
              <Settings size={16} /> Settings
            </Link>
            <Link href={`/admin/events/${id}/qr`} className="btn-primary btn-sm">
              <QrCode size={16} /> QR code
            </Link>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Photos" value={stats.uploaded_count} />
            <Metric label="Uploading" value={stats.pending_count} />
            <Metric label="Failed" value={stats.failed_count} warn={stats.failed_count > 0} />
          </div>

          <section className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-serif text-lg font-semibold text-ink">Photos</h2>
              <div className="flex flex-wrap items-center gap-2">
                {event.google_drive_folder_id && (
                  <a href={`https://drive.google.com/drive/folders/${event.google_drive_folder_id}`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                    <FolderOpen size={15} /> Open in Drive <ExternalLink size={13} />
                  </a>
                )}
                <ReconcileButton eventId={id} />
              </div>
            </div>
            <AdminPhotoGrid photos={photos} />
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-serif text-lg font-semibold text-ink">Upload activity</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-stone-500">No activity yet.</p>
            ) : (
              <ul className="divide-y divide-sand text-sm">
                {logs.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className={l.status === "failed" || l.status === "recorded_failed" ? "font-medium text-red-700" : "text-charcoal"}>{LOG_LABELS[l.status] ?? l.status}</span>
                      {l.error_message && <span className="block truncate text-xs text-stone-500">{l.error_message}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-stone-500">{formatRelative(l.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <EventControls eventId={id} status={event.status} uploadEnabled={event.upload_enabled} galleryEnabled={event.gallery_enabled} />
          <div className="card p-5 text-sm">
            <h2 className="font-serif text-lg font-semibold text-ink">Storage</h2>
            {event.google_drive_folder_id ? (
              <p className="mt-2 text-stone-600">Photos are saved to this event&apos;s private Google Drive folder.</p>
            ) : (
              <p className="mt-2 text-stone-600">
                The Drive folder will be created automatically when Google Drive is connected (or on the first upload).{" "}
                <Link href={`/admin/events/${id}/settings`} className="font-semibold text-sage-700 underline">
                  Set it up
                </Link>
              </p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function Metric({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-3xl p-4 text-center ${warn ? "bg-red-50 text-red-700" : "bg-ivory shadow-soft"}`}>
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-stone-500">{label}</p>
    </div>
  );
}
