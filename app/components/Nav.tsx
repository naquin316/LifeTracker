"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Live" },
  { href: "/replay", label: "Replay" },
];

export default function Nav({ right }: { right?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <header className="flex items-center gap-4 border-b border-border bg-panel px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-accent/15 text-accent">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
          </svg>
        </span>
        <span className="text-sm font-semibold tracking-tight">LifeTracker</span>
      </div>
      <nav className="flex items-center gap-1">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                active
                  ? "bg-panel-2 text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto">{right}</div>
    </header>
  );
}
