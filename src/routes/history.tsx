import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
import { ChainNotice } from "@/components/chain-state";
import { Shell } from "@/components/shell";
import { listIndexedTransactions } from "@/lib/marketplace-api";
import { fetchProgramSignatures } from "@/lib/solana/chain";
import { explorerTx, shortAddress } from "@/lib/solana/config";

export const Route = createFileRoute("/history")({ component: HistoryPage });

function HistoryPage() {
  const chain = useQuery({
    queryKey: ["signatures"],
    queryFn: () => fetchProgramSignatures(25),
  });
  const indexed = useQuery({
    queryKey: ["indexed-tx"],
    queryFn: () => listIndexedTransactions(),
  });
  const labels = new Map((indexed.data ?? []).map((row) => [row.signature, row.transaction_type]));

  return (
    <Shell>
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold">Transaction history</h1>
        <p className="text-sm text-muted">
          Signatures that touched the ProofTask program. On devnet they open in Solana Explorer. On the local validator they stay on this page.
        </p>
        <ChainNotice />
        {chain.isLoading ? <p className="text-sm text-muted">Loading signatures…</p> : null}
        <ul className="space-y-2">
          {(chain.data ?? []).map((row) => (
            <li key={row.signature} className="rounded-xl border border-border bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-fg">{labelFor(labels.get(row.signature), row.memo)}</p>
                  <p className="font-mono text-xs text-muted">{shortAddress(row.signature)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">
                    {row.blockTime ? format(new Date(row.blockTime * 1000), "PPp") : "Pending time"}
                  </p>
                  {(() => {
                    const href = explorerTx(row.signature);
                    return href ? (
                      <a className="inline-flex items-center gap-1 text-sm text-primary" href={href} target="_blank" rel="noreferrer">
                        Explorer <ExternalLink className="size-3.5" />
                      </a>
                    ) : (
                      <p className="text-xs text-muted">Confirmed locally</p>
                    );
                  })()}
                </div>
              </div>
              {row.err ? <p className="mt-2 text-xs text-danger">This transaction failed on-chain.</p> : null}
            </li>
          ))}
        </ul>
        {!chain.isLoading && (chain.data ?? []).length === 0 ? (
          <p className="text-sm text-muted">No program transactions yet.</p>
        ) : null}
      </div>
    </Shell>
  );
}

function labelFor(indexed: string | undefined, memo: string | null) {
  if (indexed) return indexed.replaceAll("_", " ");
  if (memo) return memo.replace(/^prooftask:/, "").replaceAll("_", " ");
  return "Program transaction";
}
