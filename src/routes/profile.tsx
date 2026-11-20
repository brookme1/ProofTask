import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PublicKey } from "@solana/web3.js";
import { Shell } from "@/components/shell";
import { TaskCard } from "@/components/task-card";
import { Button, Card, Field, Stat, TextInput } from "@/components/ui";
import { getProfile, recordTransaction, upsertProfile } from "@/lib/marketplace-api";
import { initializeReputationIx } from "@/lib/solana/codec";
import { fetchReputation } from "@/lib/solana/chain";
import { useMarketplace } from "@/components/chain-state";
import { explorerAddress, formatSol, shortAddress } from "@/lib/solana/config";
import { useWallet } from "@/lib/solana/wallet";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

function ProfilePage() {
  const wallet = useWallet();
  const market = useMarketplace();
  const queryClient = useQueryClient();
  const address = wallet.activePublicKey?.toBase58() ?? "";
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const profile = useQuery({
    queryKey: ["profile", address],
    queryFn: () => getProfile({ data: { walletAddress: address } }),
    enabled: address.length > 0,
  });
  const reputation = useQuery({
    queryKey: ["reputation", address],
    queryFn: () => fetchReputation(new PublicKey(address)),
    enabled: address.length > 0,
  });
  const mine = (market.data?.tasks ?? []).filter(
    (task) => task.contributor === address && task.status === "Completed",
  );

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!address) return;
    setPending(true);
    try {
      await upsertProfile({ data: { walletAddress: address, username: username || profile.data?.username || "" } });
      toast.success("Username saved");
      await queryClient.invalidateQueries({ queryKey: ["profile", address] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setPending(false);
    }
  }

  async function initReputation() {
    if (!wallet.activePublicKey) return;
    setPending(true);
    try {
      const signature = await wallet.send(
        [initializeReputationIx(wallet.activePublicKey)],
        "prooftask:initialize_reputation",
      );
      await recordTransaction({
        data: {
          signature,
          transactionType: "initialize_reputation",
          walletAddress: address,
        },
      }).catch(() => undefined);
      toast.success("Reputation account created");
      await queryClient.invalidateQueries({ queryKey: ["reputation", address] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not initialize");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell>
      <div className="space-y-5">
        <div>
          <h1 className="text-3xl font-semibold">Profile</h1>
          <p className="mt-2 break-all font-mono text-sm text-muted">{address || "No active wallet"}</p>
          {address && explorerAddress(address) ? (
            <a className="text-sm text-primary" href={explorerAddress(address)!} target="_blank" rel="noreferrer">
              View on Solana Explorer
            </a>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Balance" value={wallet.balance == null ? "—" : `${formatSol(wallet.balance)} SOL`} />
          <Stat label="Score" value={reputation.data ? String(reputation.data.reputationScore) : "—"} />
          <Stat label="Completed" value={reputation.data ? String(reputation.data.completedTasks) : "—"} />
          <Stat label="Rejected" value={reputation.data ? String(reputation.data.rejectedSubmissions) : "—"} />
        </div>
        <div className="flex flex-wrap gap-2 sm:hidden">
          <Button variant={wallet.role === "creator" ? "primary" : "ghost"} onClick={() => wallet.setRole("creator")}>
            Creator {wallet.creator ? shortAddress(wallet.creator.publicKey.toBase58()) : ""}
          </Button>
          <Button variant={wallet.role === "contributor" ? "primary" : "ghost"} onClick={() => wallet.setRole("contributor")}>
            Contributor {wallet.contributor ? shortAddress(wallet.contributor.publicKey.toBase58()) : ""}
          </Button>
        </div>
        <Card>
          <form onSubmit={(event) => void save(event)} className="space-y-4">
            <Field label="Public username" hint="Stored off-chain. Payments still key off the wallet address.">
              <TextInput
                value={username || profile.data?.username || ""}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="labeler_01"
              />
            </Field>
            <Button type="submit" disabled={pending || !address}>
              Save username
            </Button>
          </form>
        </Card>
        {!reputation.data && address ? (
          <Button variant="ghost" disabled={pending} onClick={() => void initReputation()}>
            Create on-chain reputation account
          </Button>
        ) : null}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Completed work</h2>
          {mine.length === 0 ? <p className="text-sm text-muted">No completed tasks for this wallet yet.</p> : null}
          {mine.map((task) => (
            <TaskCard key={task.taskId} task={task} />
          ))}
        </section>
      </div>
    </Shell>
  );
}
