import Link from "next/link";
import { CalendarHeart, Settings } from "lucide-react";
import { BrandMark } from "@/components/Brand";
import { SignOutButton } from "./SignOutButton";

export function AdminShell({ email, children }: { email: string | null; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="safe-top sticky top-0 z-30 border-b border-sand bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 pb-3 sm:px-6">
          <Link href="/admin" className="mr-auto flex items-center gap-2">
            <BrandMark />
            <span className="chip bg-ink text-ivory">Host</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link href="/admin" className="btn-ghost btn-sm" aria-label="Events">
              <CalendarHeart size={17} /> <span className="hidden sm:inline">Events</span>
            </Link>
            <Link href="/admin/settings" className="btn-ghost btn-sm" aria-label="Settings">
              <Settings size={17} /> <span className="hidden sm:inline">Settings</span>
            </Link>
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="safe-bottom pb-6 text-center text-xs text-stone-400">{email ? `Signed in as ${email}` : null}</footer>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-3 inline-block text-sm text-sage-700 hover:text-ink">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl font-semibold tracking-[-0.02em] text-ink sm:text-4xl">{title}</h1>
          {subtitle ? <div className="mt-1.5 text-sm text-stone-600">{subtitle}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-sage-100 text-sage-800",
    draft: "bg-stone-100 text-stone-600",
    paused: "bg-gold-100 text-gold-600",
    ended: "bg-stone-200 text-stone-700",
    uploaded: "bg-sage-100 text-sage-800",
    pending: "bg-gold-100 text-gold-600",
    failed: "bg-red-50 text-red-700",
  };
  const labels: Record<string, string> = { active: "Live", paused: "Access off" };
  return <span className={`chip ${styles[status] ?? "bg-stone-100 text-stone-600"}`}>{labels[status] ?? status[0]!.toUpperCase() + status.slice(1)}</span>;
}
