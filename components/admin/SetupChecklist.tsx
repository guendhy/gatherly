import { CheckCircle2, Circle } from "lucide-react";
import type { ConfigCheck } from "@/lib/env";

/** Shows which setup steps are done. Lists variable *names* only, never values. */
export function SetupChecklist({ checks, className = "" }: { checks: ConfigCheck[]; className?: string }) {
  return (
    <ul className={`divide-y divide-sand rounded-2xl border border-sand bg-white ${className}`}>
      {checks.map((c) => (
        <li key={c.key} className="flex gap-3 px-4 py-3">
          {c.ok ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-sage-600" /> : <Circle size={20} className="mt-0.5 shrink-0 text-stone-300" />}
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${c.ok ? "text-ink" : "text-charcoal"}`}>{c.label}</p>
            {!c.ok && (
              <p className="mt-0.5 text-xs text-stone-500">
                Set {c.vars.map((v) => <code key={v} className="mr-1 rounded bg-sage-50 px-1 py-0.5 text-[11px] break-all">{v}</code>)}— needed for {c.requiredFor}.
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
