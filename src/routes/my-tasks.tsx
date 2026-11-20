import { createFileRoute } from "@tanstack/react-router";
import { ChainNotice, useMarketplace } from "@/components/chain-state";
import { Shell } from "@/components/shell";
import { TaskCard } from "@/components/task-card";
import { useWallet } from "@/lib/solana/wallet";

export const Route = createFileRoute("/my-tasks")({ component: MyTasks });

function MyTasks() {
  const market = useMarketplace();
  const wallet = useWallet();
  const me = wallet.activePublicKey?.toBase58();
  const tasks = (market.data?.tasks ?? []).filter((task) => task.creator === me);

  return (
    <Shell>
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold">My tasks</h1>
        <p className="text-sm text-muted">Tasks created by the active wallet.</p>
        <ChainNotice />
        {tasks.length === 0 ? <p className="text-sm text-muted">Nothing created with this wallet yet.</p> : null}
        {tasks.map((task) => (
          <TaskCard key={task.taskId} task={task} />
        ))}
      </div>
    </Shell>
  );
}
