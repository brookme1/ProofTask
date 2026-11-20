import { Link } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { formatSol, shortAddress } from "@/lib/solana/config";
import type { TaskAccount } from "@/lib/solana/codec";
import { StatusPill } from "./ui";

export function TaskCard({ task }: { task: TaskAccount }) {
  const deadline = formatDistanceToNowStrict(new Date(task.deadline * 1000), { addSuffix: true });
  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: String(task.taskId) }}
      className="block rounded-xl border border-border bg-surface p-5 transition-colors duration-200 hover:border-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{task.category}</p>
          <h3 className="mt-1 text-lg font-semibold text-fg">{task.title}</h3>
        </div>
        <StatusPill status={task.status} />
      </div>
      <p className="mt-3 line-clamp-2 text-sm text-muted">{task.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span className="font-mono text-sm tabular-nums text-accent">{formatSol(task.rewardLamports)} SOL</span>
        <span>{task.requiredItems} items</span>
        <span>Due {deadline}</span>
        <span className="font-mono">{shortAddress(task.creator)}</span>
      </div>
    </Link>
  );
}
