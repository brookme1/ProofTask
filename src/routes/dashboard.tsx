import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ChainNotice, useMarketplace } from "@/components/chain-state";
import { Shell } from "@/components/shell";
import { TaskCard } from "@/components/task-card";
import { Button, Stat } from "@/components/ui";
import { recordTransaction } from "@/lib/marketplace-api";
import { initializePlatformIx } from "@/lib/solana/codec";
import { formatSol, PROGRAM_ID, shortAddress, CLUSTER_NOTE } from "@/lib/solana/config";
import { useWallet } from "@/lib/solana/wallet";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

function Dashboard() {
  const market = useMarketplace();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const platform = market.data?.platform;
  const tasks = market.data?.tasks ?? [];
  const me = wallet.activePublicKey?.toBase58();
  const review = tasks.filter((task) => task.creator === me && task.status === "Submitted");
  const contributors = new Set(tasks.map((task) => task.contributor).filter((key) => key !== "11111111111111111111111111111111"));

  async function activate() {
    if (!wallet.activePublicKey) return toast.error("Choose a wallet first");
    setPending(true);
    try {
      const signature = await wallet.send([initializePlatformIx(wallet.activePublicKey)], "prooftask:initialize_platform");
      await recordTransaction({
        data: {
          signature,
          transactionType: "initialize_platform",
          walletAddress: wallet.activePublicKey.toBase58(),
        },
      }).catch(() => undefined);
      toast.success("Marketplace account created");
      await queryClient.invalidateQueries({ queryKey: ["marketplace"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not initialize");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Dashboard</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Signing as {me ? shortAddress(me) : "nobody"}. Creator and contributor are separate keys saved in this browser. {CLUSTER_NOTE}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => void wallet.airdropActive().then(() => toast.success("Airdrop confirmed")).catch((error: Error) => toast.error(error.message))}>
              Airdrop 1 SOL
            </Button>
            <Link to="/create" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 py-3 text-sm font-medium text-accent-fg">
              New task
            </Link>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Open tasks" value={platform ? String(platform.openCount) : "—"} />
          <Stat label="Completed" value={platform ? String(platform.completedCount) : "—"} />
          <Stat label="SOL distributed" value={platform ? formatSol(platform.totalDistributed) : "—"} hint="From the program, not the database" />
          <Stat label="Contributors" value={String(contributors.size)} hint="Wallets that accepted work" />
        </div>
        <ChainNotice />
        {market.data?.deployed && !platform ? (
          <Button disabled={pending} onClick={() => void activate()}>
            {pending ? "Initializing…" : "Initialize marketplace"}
          </Button>
        ) : null}
        {review.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Needs your review</h2>
            {review.map((task) => (
              <TaskCard key={task.taskId} task={task} />
            ))}
          </section>
        ) : null}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent tasks</h2>
            <Link to="/explore" className="text-sm text-primary">Explore</Link>
          </div>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted">No tasks on this program yet.</p>
          ) : (
            tasks.slice(0, 4).map((task) => <TaskCard key={task.taskId} task={task} />)
          )}
        </section>
        <p className="break-all font-mono text-xs text-muted">Program {PROGRAM_ID.toBase58()}</p>
      </div>
    </Shell>
  );
}
