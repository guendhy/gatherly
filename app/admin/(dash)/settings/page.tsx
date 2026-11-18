import { PageHeader } from "@/components/admin/AdminShell";
import { GoogleConnectionCard } from "@/components/admin/GoogleConnectionCard";
import { SetupChecklist } from "@/components/admin/SetupChecklist";
import { getAppUrl, getConfigChecks } from "@/lib/env";
import { getStorageStatus } from "@/lib/google/connection";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

const ERROR_TEXT: Record<string, string> = {
  denied: "Google access was not granted. Try again and tick the Google Drive permission.",
  state_mismatch: "The sign-in session expired or didn't match. Please try connecting again.",
  not_admin: "Please sign in as an administrator before connecting Google Drive.",
  scope_missing: "Google Drive permission wasn't granted. Try again and allow access to Google Drive files.",
  no_refresh_token: "Google didn't return a long-lived token. Remove Gatherly at myaccount.google.com/permissions, then connect again.",
  not_configured: "Google OAuth isn't configured yet (missing environment variables).",
  exchange_failed: "Google rejected the connection. Check that the redirect URI in Google Cloud exactly matches the one shown below.",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ google?: string; reason?: string }> }) {
  const sp = await searchParams;
  const storage = await getStorageStatus();
  const checks = getConfigChecks();
  const oauthConfigured = checks.find((c) => c.key === "google")?.ok ?? false;
  const flash =
    sp.google === "connected"
      ? { kind: "ok" as const, text: "Google Drive connected and verified — Gatherly created a “Gatherly Events” folder in your Drive." }
      : sp.google === "error"
        ? { kind: "error" as const, text: ERROR_TEXT[sp.reason ?? ""] ?? "Connecting Google Drive failed. Please try again." }
        : null;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() || `${getAppUrl()}/api/admin/google/callback`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" subtitle="Storage connection and setup status." />
      <GoogleConnectionCard storage={storage} oauthConfigured={oauthConfigured} flash={flash} />

      <section className="card p-5 sm:p-6">
        <h2 className="font-serif text-xl font-semibold text-ink">Setup status</h2>
        <p className="mt-1 text-sm text-stone-600">Values are never shown here — only whether each variable is set.</p>
        <SetupChecklist checks={checks} className="mt-4" />
        <div className="mt-5 rounded-2xl bg-sage-50 p-4 text-sm">
          <p className="font-semibold text-ink">OAuth redirect URI</p>
          <p className="mt-1 text-stone-600">Add exactly this under “Authorized redirect URIs” on your Google OAuth client:</p>
          <code className="mt-2 block rounded-xl bg-white px-3 py-2 text-xs break-all">{redirectUri}</code>
        </div>
      </section>
    </div>
  );
}
