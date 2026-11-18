import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/Brand";
import { LoginForm } from "@/components/admin/LoginForm";
import { SetupChecklist } from "@/components/admin/SetupChecklist";
import { getAdminForPage } from "@/lib/auth/admin";
import { getConfigChecks } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin login", robots: { index: false, follow: false } };

export default async function AdminLoginPage() {
  const state = await getAdminForPage();
  if (state.state === "admin") redirect("/admin");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <Link href="/" className="mb-8">
        <BrandMark />
      </Link>
      {state.state === "unconfigured" ? (
        <div className="card w-full max-w-lg p-6 sm:p-8">
          <h1 className="font-serif text-2xl font-semibold text-ink">Finish setting up Gatherly</h1>
          <p className="mt-2 text-sm text-stone-600">
            The database connection isn&apos;t configured yet. Add these environment variables in Vercel (Project → Settings → Environment Variables), then redeploy. See README.md for step-by-step instructions.
          </p>
          <SetupChecklist checks={getConfigChecks()} className="mt-6" />
        </div>
      ) : (
        <div className="card w-full max-w-sm p-6 sm:p-8">
          <h1 className="font-serif text-2xl font-semibold text-ink">Host sign in</h1>
          <p className="mt-1 text-sm text-stone-600">Manage your events, QR codes and photos.</p>
          {state.state === "forbidden" && (
            <p className="mt-4 rounded-2xl bg-gold-100 px-4 py-3 text-sm text-charcoal">
              You&apos;re signed in as <strong>{state.email}</strong>, which isn&apos;t an administrator. Add this email to <code>ADMIN_EMAILS</code> (and confirm it in Supabase), or sign in with another account.
            </p>
          )}
          <LoginForm />
        </div>
      )}
      <Link href="/" className="mt-6 text-sm text-stone-500 hover:text-ink">
        ← Back to Gatherly
      </Link>
    </div>
  );
}
