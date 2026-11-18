import Link from "next/link";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[22px] font-extrabold tracking-[-0.04em] text-ink ${className}`}>
      <span aria-hidden className="text-[24px] font-normal text-sage-400">
        ✳
      </span>
      <span>
        gatherly<span className="text-gold-500">.</span>
      </span>
    </span>
  );
}

export function BrandLink({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={className} aria-label="Gatherly home">
      <BrandMark />
    </Link>
  );
}

export function Sparkle({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`text-gold-500 ${className}`}>
      ✦
    </span>
  );
}
