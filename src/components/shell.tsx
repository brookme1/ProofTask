import { Link, useRouterState } from "@tanstack/react-router";
import {
  ClipboardList,
  Compass,
  History,
  LayoutDashboard,
  Plus,
  Trophy,
  UserRound,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatSol, shortAddress } from "@/lib/solana/config";
import { useWallet } from "@/lib/solana/wallet";
import { Button } from "./ui";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/create", label: "Create", icon: Plus },
  { to: "/my-tasks", label: "My tasks", icon: ClipboardList },
  { to: "/submissions", label: "Submissions", icon: ClipboardList },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { to: "/profile", label: "Profile", icon: UserRound },
  { to: "/history", label: "History", icon: History },
] as const;

function NavLink({
  to,
  label,
  icon: Icon,
  onClick,
}: {
  to: string;
  label: string;
  icon: typeof Compass;
  onClick?: () => void;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = pathname === to;
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm",
        active ? "bg-primary text-primary-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const address = wallet.activePublicKey?.toBase58();

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            ProofTask
          </Link>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1 rounded-xl border border-border bg-surface p-1 sm:flex">
              {(
                [
                  ["creator", "Creator"],
                  ["contributor", "Contributor"],
                ] as const
              ).map(([role, label]) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => wallet.setRole(role)}
                  className={cn(
                    "min-h-9 rounded-lg px-3 text-xs font-medium",
                    wallet.role === role ? "bg-primary text-primary-fg" : "text-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {wallet.phantomDetected ? (
              wallet.phantomConnected && wallet.role === "phantom" ? (
                <Button variant="ghost" className="px-3 py-2" onClick={() => void wallet.disconnectPhantom()}>
                  Disconnect
                </Button>
              ) : (
                <Button variant="ghost" className="px-3 py-2" onClick={() => void wallet.connectPhantom()}>
                  <Wallet className="size-4" />
                  Phantom
                </Button>
              )
            ) : null}
            <div className="hidden text-right sm:block">
              <p className="font-mono text-xs text-fg">{address ? shortAddress(address) : "No wallet"}</p>
              <p className="font-mono text-xs tabular-nums text-accent">
                {wallet.balance == null ? "—" : `${formatSol(wallet.balance)} SOL`}
              </p>
            </div>
            <button
              type="button"
              className="min-h-11 rounded-xl border border-border px-3 text-sm md:hidden"
              onClick={() => setOpen((value) => !value)}
            >
              Menu
            </button>
          </div>
        </div>
        {open ? (
          <div className="space-y-1 border-t border-border px-4 py-3 md:hidden">
            {links.map((link) => (
              <NavLink key={link.to} {...link} onClick={() => setOpen(false)} />
            ))}
          </div>
        ) : null}
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[200px_1fr]">
        <aside className="hidden md:block">
          <nav className="sticky top-24 flex flex-col gap-1">
            {links.map((link) => (
              <NavLink key={link.to} {...link} />
            ))}
          </nav>
        </aside>
        <div className="min-w-0 pb-20 md:pb-0">{children}</div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-bg md:hidden">
        {links.slice(0, 4).map((link) => (
          <NavLink key={link.to} {...link} />
        ))}
      </nav>
    </div>
  );
}
