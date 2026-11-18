import Link from "next/link";
import { AlertTriangle, CalendarDays, Camera, CheckCircle2, CloudOff, ImageIcon, Plus, QrCode, Sparkles } from "lucide-react";
import { PageHeader, StatusChip } from "@/components/admin/AdminShell";
import { SetupChecklist } from "@/components/admin/SetupChecklist";
import { getConfigChecks } from "@/lib/env";
import { formatEventDate, formatRelative } from "@/lib/format";
import { getStorageStatus } from "@/lib/google/connection";
import { listEventsWithStats } from "@/lib/services/admin-events";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [events, storage] = await Promise.all([listEventsWithStats(), getStorageStatus()]);
  const checks = getConfigChecks();
  const configReady = checks.filter((c) => c.key !== "admins").every((c) => c.ok);
  const showSetup = !configReady || !storage.connected || events.length === 0;

  return (
    <>
      <PageHeader
        title="Your events"
        subtitle={events.length ? `${events.length} event${events.length === 1 ? "" : "s"}` : "Create your first event to get a QR code."}
        actions={
          <Link href="/admin/events/new" className="btn-primary">
            <Plus size={18} /> New event
          </Link>
        }
      />

      {storage.status === "error" && (
        <div role="alert" className="mb-6 flex gap-3 rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <AlertTriangle size={20} className="shrink-0" />
          <div>
            <p className="font-semibold">Google Drive needs to be reconnected</p>
            <p className="mt-1">Guests can&apos;t upload until you reconnect. This usually happens when Google OAuth is in Testing mode (tokens expire after 7 days) or access was revoked.</p>
            <Link href="/admin/settings" className="btn-danger btn-sm mt-3">
              Reconnect Google Drive
            </Link>
          </div>
        </div>
      )}

      {showSetup && (
        <section className="card mb-8 p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-gold-100 text-gold-600">
              <Sparkles size={20} />
            </span>
            <div>
              <h2 className="font-serif text-xl font-semibold text-ink">Get Gatherly ready</h2>
              <p className="text-sm text-stone-600">Three steps and your guests can start sharing.</p>
            </div>
          </div>
          <ol className="mt-5 grid gap-3 sm:grid-cols-3">
            <SetupStep n={1} done={configReady} title="Configure" body="Environment variables set in Vercel." href={configReady ? undefined : "/admin/settings"} />
            <SetupStep n={2} done={storage.connected} title="Connect Google Drive" body="Photos are stored in your Drive." href={storage.connected ? undefined : "/admin/settings"} />
            <SetupStep n={3} done={events.length > 0} title="Create an event" body="Get a QR code to print or share." href={events.length ? undefined : "/admin/events/new"} />
          </ol>
          {!configReady && <SetupChecklist checks={checks} className="mt-5" />}
        </section>
      )}

      {events.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-sage-300 px-6 py-16 text-center">
          <CalendarDays size={36} className="text-sage-400" />
          <h2 className="mt-4 font-serif text-2xl font-semibold text-ink">No events yet</h2>
          <p className="mt-1 max-w-sm text-sm text-stone-600">Create an event, then print or share its QR code. Guests scan it to start capturing moments.</p>
          <Link href="/admin/events/new" className="btn-primary mt-6">
            <Plus size={18} /> Create event
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {events.map((e) => (
            <article key={e.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/admin/events/${e.id}`} className="min-w-0">
                  <h2 className="truncate font-serif text-xl font-semibold text-ink hover:underline">{e.event_name}</h2>
                  <p className="mt-0.5 text-sm text-stone-500">{formatEventDate(e.event_date) ?? "No date set"}</p>
                </Link>
                <StatusChip status={e.status} />
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                <Stat icon={<ImageIcon size={15} />} label="Photos" value={e.stats.uploaded_count} />
                <Stat icon={<CloudOff size={15} />} label="Failed" value={e.stats.failed_count} warn={e.stats.failed_count > 0} />
                <Stat icon={<Camera size={15} />} label="Last" value={e.stats.last_upload_at ? formatRelative(e.stats.last_upload_at) : "—"} small />
              </dl>
              <div className="mt-5 flex gap-2">
                <Link href={`/admin/events/${e.id}`} className="btn-secondary btn-sm flex-1">
                  Manage
                </Link>
                <Link href={`/admin/events/${e.id}/qr`} className="btn-primary btn-sm flex-1">
                  <QrCode size={16} /> QR code
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function SetupStep({ n, done, title, body, href }: { n: number; done: boolean; title: string; body: string; href?: string }) {
  const inner = (
    <div className={`h-full rounded-2xl border p-4 ${done ? "border-sage-200 bg-sage-50" : "border-sand bg-white"}`}>
      <div className="flex items-center gap-2">
        {done ? <CheckCircle2 size={18} className="text-sage-600" /> : <span className="grid size-[18px] place-items-center rounded-full bg-ink text-[10px] font-bold text-white">{n}</span>}
        <span className="text-sm font-semibold text-ink">{title}</span>
      </div>
      <p className="mt-1.5 text-xs text-stone-600">{body}</p>
    </div>
  );
  return <li>{href ? <Link href={href}>{inner}</Link> : inner}</li>;
}

function Stat({ icon, label, value, warn, small }: { icon: React.ReactNode; label: string; value: string | number; warn?: boolean; small?: boolean }) {
  return (
    <div className={`rounded-2xl px-2 py-3 ${warn ? "bg-red-50 text-red-700" : "bg-sage-50 text-ink"}`}>
      <dt className="flex items-center justify-center gap-1 text-[11px] text-stone-500">
        {icon} {label}
      </dt>
      <dd className={`mt-1 font-semibold tabular-nums ${small ? "text-xs" : "text-xl"}`}>{value}</dd>
    </div>
  );
}
