import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PartyPopper } from "lucide-react";
import { PageHeader } from "@/components/admin/AdminShell";
import { QrPanel } from "@/components/admin/QrPanel";
import { formatEventDate } from "@/lib/format";
import { UUID_RE } from "@/lib/request";
import * as repo from "@/lib/repo";
import { getEventAccess } from "@/lib/services/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "QR code" };

export default async function EventQrPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const event = await repo.getEventById(id);
  if (!event) notFound();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : undefined;
  const access = await getEventAccess(event, origin);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="QR code" subtitle={event.event_name} back={{ href: `/admin/events/${id}`, label: event.event_name }} />
      {created && (
        <div className="mb-5 flex gap-3 rounded-3xl bg-sage-100 p-4 text-sm text-sage-900">
          <PartyPopper size={20} className="shrink-0" />
          <p>
            <strong>Your event is live!</strong> Download the QR code to print, or share the link. Try scanning it with your own phone first.
          </p>
        </div>
      )}
      <QrPanel eventId={id} eventName={event.event_name} dateLabel={formatEventDate(event.event_date)} initial={access} />
    </div>
  );
}
