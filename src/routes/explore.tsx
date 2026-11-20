import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChainNotice, useMarketplace } from "@/components/chain-state";
import { Shell } from "@/components/shell";
import { TaskCard } from "@/components/task-card";
import { Select, TextInput } from "@/components/ui";
import { CATEGORIES } from "@/lib/solana/config";

export const Route = createFileRoute("/explore")({ component: Explore });

function Explore() {
  const market = useMarketplace();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("reward");
  const tasks = market.data?.tasks ?? [];

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = tasks.filter((task) => {
      const matchesCategory = category === "All" || task.category === category;
      const matchesQuery =
        !needle ||
        task.title.toLowerCase().includes(needle) ||
        task.description.toLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });
    return filtered.sort((a, b) => {
      if (sort === "newest") return b.taskId - a.taskId;
      if (sort === "low") return a.rewardLamports - b.rewardLamports;
      return b.rewardLamports - a.rewardLamports;
    });
  }, [category, query, sort, tasks]);

  return (
    <Shell>
      <div className="space-y-5">
        <div>
          <h1 className="text-3xl font-semibold">Explore tasks</h1>
          <p className="mt-2 text-sm text-muted">Every card is an account on the ProofTask program. Status is read from chain, not from a local mock.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_160px]">
          <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or brief" />
          <Select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option>All</option>
            {CATEGORIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </Select>
          <Select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="reward">Highest reward</option>
            <option value="low">Lowest reward</option>
            <option value="newest">Newest</option>
          </Select>
        </div>
        <ChainNotice />
        {market.isLoading ? <p className="text-sm text-muted">Loading accounts…</p> : null}
        {!market.isLoading && visible.length === 0 ? (
          <p className="text-sm text-muted">No tasks match. Create one after the marketplace is initialized.</p>
        ) : null}
        <div className="grid gap-3">
          {visible.map((task) => (
            <TaskCard key={task.taskId} task={task} />
          ))}
        </div>
      </div>
    </Shell>
  );
}
