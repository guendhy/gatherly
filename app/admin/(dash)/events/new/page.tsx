import { PageHeader } from "@/components/admin/AdminShell";
import { EventForm } from "@/components/admin/EventForm";

export const metadata = { title: "New event" };

export default function NewEventPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New event" subtitle="You'll get a QR code and an event code as soon as it's created." back={{ href: "/admin", label: "Events" }} />
      <EventForm mode="create" />
    </div>
  );
}
