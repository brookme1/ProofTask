import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChainNotice, useMarketplace } from "@/components/chain-state";
import { Shell } from "@/components/shell";
import { listProfiles } from "@/lib/marketplace-api";
import { fetchReputations } from "@/lib/solana/chain";
import { formatSol, shortAddress } from "@/lib/solana/config";

export const Route = createFileRoute("/leaderboard")({ component: Leaderboard });

function Leaderboard() {
  const market = useMarketplace();
  const contributors = (market.data?.tasks ?? []).map((task) => task.contributor);
  const reputations = useQuery({
    queryKey: ["reputations", contributors.slice().sort().join(",")],
    queryFn: () => fetchReputations(contributors),
    enabled: contributors.length > 0,
  });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: () => listProfiles() });
  const names = new Map((profiles.data ?? []).map((row) => [row.wallet_address, row.username]));

  return (
    <Shell>
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold">Leaderboard</h1>
        <p className="text-sm text-muted">
          Score is 100 points per completed task, minus 25 per rejection, floored at zero. The program writes it.
        </p>
        <ChainNotice />
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Contributor</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Completed</th>
                <th className="px-4 py-3 font-medium">Rejected</th>
                <th className="px-4 py-3 font-medium">Earned</th>
              </tr>
            </thead>
            <tbody>
              {(reputations.data ?? []).map((row) => (
                <tr key={row.address} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link to="/profile" className="block font-medium text-fg">
                      {names.get(row.contributor) || shortAddress(row.contributor)}
                    </Link>
                    <p className="font-mono text-xs text-muted">{shortAddress(row.contributor)}</p>
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums">{row.reputationScore}</td>
                  <td className="px-4 py-3 tabular-nums">{row.completedTasks}</td>
                  <td className="px-4 py-3 tabular-nums">{row.rejectedSubmissions}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-accent">{formatSol(row.totalEarned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!reputations.isLoading && (reputations.data ?? []).length === 0 ? (
          <p className="text-sm text-muted">Reputation accounts appear after a contributor accepts a task.</p>
        ) : null}
      </div>
    </Shell>
  );
}
