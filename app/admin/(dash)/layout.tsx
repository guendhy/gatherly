import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminForPage } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Host dashboard", robots: { index: false, follow: false } };

/** Server-side gate for every /admin page (API routes enforce the same check independently). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const state = await getAdminForPage();
  if (state.state !== "admin") redirect("/admin/login");
  return <AdminShell email={state.admin.email}>{children}</AdminShell>;
}
