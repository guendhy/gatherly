import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark, Sparkle } from "@/components/Brand";

export function GuestShell({ children, back, title }: { children: React.ReactNode; back?: string; title?: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col bg-ivory shadow-[0_0_60px_rgb(38_61_51/0.06)]">
      <header className="safe-top sticky top-0 z-20 flex items-center gap-3 border-b border-sand/70 bg-ivory/90 px-4 pb-3 backdrop-blur">
        {back ? (
          <Link href={back} className="-ml-1 grid size-10 place-items-center rounded-full text-ink hover:bg-sage-100" aria-label="Back">
            <ArrowLeft size={20} />
          </Link>
        ) : null}
        {title ? <h1 className="min-w-0 flex-1 truncate font-serif text-lg font-semibold text-ink">{title}</h1> : <BrandMark className="flex-1" />}
        {title ? <BrandMark className="scale-75 origin-right" /> : null}
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="safe-bottom px-4 pt-4 text-center text-[11px] text-stone-400">
        Made for moments worth keeping <Sparkle />
      </footer>
    </div>
  );
}

export function StatusScreen({ icon, title, children, action }: { icon: React.ReactNode; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <GuestShell>
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
        <div className="mb-6 grid size-20 place-items-center rounded-full bg-sage-100 text-sage-700">{icon}</div>
        <h2 className="font-serif text-3xl font-semibold text-ink">{title}</h2>
        <div className="mt-3 max-w-sm text-[15px] leading-relaxed text-stone-600">{children}</div>
        {action ? <div className="mt-8 w-full max-w-xs">{action}</div> : null}
      </div>
    </GuestShell>
  );
}
