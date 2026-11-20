import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicKey } from "@solana/web3.js";
import { ChainNotice, useMarketplace } from "@/components/chain-state";
import { Shell } from "@/components/shell";
import { TaskCard } from "@/components/task-card";
import { useWallet } from "@/lib/solana/wallet";

export const Route = createFileRoute("/submissions")({ component: Submissions });

function Submissions() {
  const market = useMarketplace();
  const wallet = useWallet();
  const me = wallet.activePublicKey?.toBase58();
  const mine = (market.data?.tasks ?? []).filter(
    (task) => task.contributor === me && me !== PublicKey.default.toBase58(),
  );

  return (
    <Shell>
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold">My submissions</h1>
        <p className="text-sm text-muted">Tasks assigned to the active wallet. Open one to submit or correct work.</p>
        <ChainNotice />
        {mine.length === 0 ? (
          <p className="text-sm text-muted">
            No assignments yet. <Link to="/explore" className="text-primary">Find a task</Link>.
          </p>
        ) : null}
        {mine.map((task) => (
          <TaskCard key={task.taskId} task={task} />
        ))}
      </div>
    </Shell>
  );
}
