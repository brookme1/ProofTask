import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, LockKeyhole, ShieldCheck, Wallet } from "lucide-react";
import { ChainNotice, useMarketplace } from "@/components/chain-state";
import { formatSol, PROGRAM_ID } from "@/lib/solana/config";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const market = useMarketplace();
  const platform = market.data?.platform;

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="text-lg font-semibold tracking-tight">ProofTask</span>
        <nav className="flex items-center gap-2">
          <Link to="/explore" className="min-h-11 rounded-xl px-3 py-3 text-sm text-muted">
            Explore
          </Link>
          <Link to="/dashboard" className="min-h-11 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-fg">
            Open app
          </Link>
        </nav>
      </header>
      <main className="mx-auto grid max-w-6xl gap-10 px-4 pb-20 pt-8 md:grid-cols-[1.2fr_0.8fr] md:pt-16">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent">On-chain SOL escrow</p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight md:text-6xl">
            Human proof for AI data, paid by the program.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-7 text-muted">
            Creators lock SOL in a task account. Contributors label, transcribe, and evaluate. Approval is an on-chain instruction that releases the escrow and writes reputation. The app cannot pay anyone by itself.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/create" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-medium text-accent-fg">
              Create a task <ArrowRight className="size-4" />
            </Link>
            <Link to="/explore" className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 py-3 text-sm">
              Browse open work
            </Link>
          </div>
          <dl className="mt-10 grid grid-cols-3 gap-3">
            <Stat label="Open" value={platform ? String(platform.openCount) : "—"} />
            <Stat label="Paid out" value={platform ? `${formatSol(platform.totalDistributed, 2)}` : "—"} />
            <Stat label="Completed" value={platform ? String(platform.completedCount) : "—"} />
          </dl>
        </div>
        <div className="space-y-4">
          <article className="rounded-xl border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-wide text-muted">Example brief</p>
            <h2 className="mt-2 text-xl font-semibold">Identify cars in images</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Label 100 images that contain cars. Reward sits in escrow until the creator approves the submission.</p>
            <p className="mt-4 font-mono text-2xl tabular-nums text-accent">0.5 SOL</p>
            <ol className="mt-4 space-y-3 text-sm">
              <Step icon={Wallet} text="Creator deposits the reward into the task PDA." />
              <Step icon={ShieldCheck} text="One contributor accepts. A second acceptance fails." />
              <Step icon={LockKeyhole} text="Approval moves lamports. Rejection does not." />
            </ol>
          </article>
          <ChainNotice />
          <p className="break-all font-mono text-xs text-muted">Program {PROGRAM_ID.toBase58()}</p>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-mono text-lg tabular-nums">{value}</p>
    </div>
  );
}

function Step({ icon: Icon, text }: { icon: typeof Wallet; text: string }) {
  return (
    <li className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{text}</span>
    </li>
  );
}
