"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { apiFetch } from "@/lib/client/api";

export function SignOutButton({ className = "btn-ghost btn-sm" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      className={className}
      onClick={async () => {
        await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        router.replace("/admin/login");
        router.refresh();
      }}
      aria-label="Sign out"
    >
      <LogOut size={17} /> <span className="hidden sm:inline">Sign out</span>
    </button>
  );
}
