import { useQuery } from "@tanstack/react-query";
import { loadMarketplace } from "@/lib/solana/chain";
import { CLUSTER_NOTE, PROGRAM_ID } from "@/lib/solana/config";
import { Button, Card } from "./ui";

export function useMarketplace() {
  return useQuery({
    queryKey: ["marketplace"],
    queryFn: loadMarketplace,
    refetchInterval: 20_000,
  });
}

export function ChainNotice() {
  const query = useMarketplace();
  if (query.isLoading) {
    return <Card><p className="text-sm text-muted">Reading the ProofTask program…</p></Card>;
  }
  if (query.isError) {
    return (
      <Card>
        <p className="text-sm text-fg">The chain did not answer.</p>
        <p className="mt-1 text-sm text-muted">{query.error instanceof Error ? query.error.message : "RPC error"}</p>
        <Button className="mt-4" variant="ghost" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </Card>
    );
  }
  if (query.data && !query.data.deployed) {
    return (
      <Card>
        <p className="text-sm font-medium text-fg">The ProofTask program is not loaded on this chain.</p>
        <p className="mt-2 font-mono text-xs text-muted break-all">{PROGRAM_ID.toBase58()}</p>
        <p className="mt-2 text-sm text-muted">{CLUSTER_NOTE}</p>
      </Card>
    );
  }
  if (query.data?.deployed && !query.data.platform) {
    return (
      <Card>
        <p className="text-sm text-fg">The program is live. The marketplace account still needs to be initialized once.</p>
      </Card>
    );
  }
  return null;
}
