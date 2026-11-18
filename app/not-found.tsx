import Link from "next/link";
import { SearchX } from "lucide-react";
import { StatusScreen } from "@/components/guest/GuestShell";

export default function NotFound() {
  return (
    <StatusScreen
      icon={<SearchX size={30} />}
      title="Page not found"
      action={
        <Link href="/" className="btn-primary w-full">
          Go to Gatherly
        </Link>
      }
    >
      We couldn&apos;t find that page or event. Please check your invitation link or scan the event QR code again.
    </StatusScreen>
  );
}
