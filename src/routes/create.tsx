import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ChainNotice, useMarketplace } from "@/components/chain-state";
import { Shell } from "@/components/shell";
import { Button, Card, Field, Select, TextArea, TextInput } from "@/components/ui";
import { indexTask, recordTransaction } from "@/lib/marketplace-api";
import { createTaskIx } from "@/lib/solana/codec";
import { byteLength, CATEGORIES, explorerTx, formatSol, MIN_REWARD_LAMPORTS } from "@/lib/solana/config";
import { useWallet } from "@/lib/solana/wallet";

export const Route = createFileRoute("/create")({ component: CreateTaskPage });

function defaultDeadline() {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function CreateTaskPage() {
  const wallet = useWallet();
  const market = useMarketplace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("Identify Cars in Images");
  const [description, setDescription] = useState("Label 100 images containing cars.");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [instructions, setInstructions] = useState("Mark each image that contains at least one car. Paste the result sheet link.");
  const [items, setItems] = useState("100");
  const [reward, setReward] = useState("0.05");
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [metadataUri, setMetadataUri] = useState("");
  const [pending, setPending] = useState(false);

  const rewardLamports = Math.round(Number(reward) * 1_000_000_000);
  const deadlineUnix = Math.floor(new Date(deadline).getTime() / 1000);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!wallet.activePublicKey) return toast.error("Choose a wallet, then airdrop SOL from the dashboard.");
    if (!market.data?.platform) return toast.error("Initialize the marketplace from the dashboard first.");
    if (!title.trim() || byteLength(title.trim()) > 64) return toast.error("Title must be 1–64 bytes.");
    if (byteLength(description.trim()) > 400 || byteLength(instructions.trim()) > 400) {
      return toast.error("Description and instructions must each be 400 bytes or less.");
    }
    if (byteLength(metadataUri.trim()) > 200) return toast.error("Attachment link is too long.");
    const requiredItems = Number(items);
    if (!Number.isInteger(requiredItems) || requiredItems < 1) return toast.error("Item count must be a positive integer.");
    if (!Number.isFinite(rewardLamports) || rewardLamports < MIN_REWARD_LAMPORTS) {
      return toast.error("Reward must be at least 0.0001 SOL.");
    }
    if (!Number.isFinite(deadlineUnix) || deadlineUnix * 1000 <= Date.now()) {
      return toast.error("Deadline must be in the future.");
    }

    setPending(true);
    try {
      let taskId = market.data.platform.taskCount;
      let signature = "";
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          signature = await wallet.send(
            [
              createTaskIx(wallet.activePublicKey, {
                taskId,
                title: title.trim(),
                category,
                description: description.trim(),
                instructions: instructions.trim(),
                requiredItems,
                rewardLamports,
                deadline: deadlineUnix,
                metadataUri: metadataUri.trim(),
              }),
            ],
            `prooftask:create_task:${taskId}`,
          );
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (attempt === 0 && message.toLowerCase().includes("task id")) {
            await queryClient.invalidateQueries({ queryKey: ["marketplace"] });
            const fresh = await market.refetch();
            taskId = fresh.data?.platform?.taskCount ?? taskId + 1;
            continue;
          }
          throw error;
        }
      }
      await indexTask({
        data: {
          onChainTaskId: String(taskId),
          creatorWallet: wallet.activePublicKey.toBase58(),
          title: title.trim(),
          description: description.trim(),
          category,
          metadataUri: metadataUri.trim() || undefined,
        },
      }).catch(() => undefined);
      await recordTransaction({
        data: {
          signature,
          transactionType: "create_task",
          walletAddress: wallet.activePublicKey.toBase58(),
          taskId: String(taskId),
        },
      }).catch(() => undefined);
      const explorer = explorerTx(signature);
      toast.success(`Task #${taskId} escrowed ${formatSol(rewardLamports)} SOL`, explorer
        ? { action: { label: "Explorer", onClick: () => window.open(explorer, "_blank", "noopener") } }
        : undefined);
      await queryClient.invalidateQueries({ queryKey: ["marketplace"] });
      await navigate({ to: "/tasks/$taskId", params: { taskId: String(taskId) } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell>
      <form onSubmit={(event) => void onSubmit(event)} className="mx-auto max-w-2xl space-y-5">
        <div>
          <h1 className="text-3xl font-semibold">Create a task</h1>
          <p className="mt-2 text-sm text-muted">
            One transaction creates the task account and deposits the reward. You pay rent for the account plus the escrow.
          </p>
        </div>
        <ChainNotice />
        <Card className="space-y-4">
          <Field label="Title" hint={`${byteLength(title)} / 64 bytes`}>
            <TextInput value={title} onChange={(event) => setTitle(event.target.value)} required />
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field label="Description" hint={`${byteLength(description)} / 400 bytes`}>
            <TextArea value={description} onChange={(event) => setDescription(event.target.value)} required />
          </Field>
          <Field label="Instructions" hint={`${byteLength(instructions)} / 400 bytes`}>
            <TextArea value={instructions} onChange={(event) => setInstructions(event.target.value)} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Required items">
              <TextInput value={items} onChange={(event) => setItems(event.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Reward (SOL)" hint="Demo preset is 0.5. Minimum is 0.0001.">
              <TextInput value={reward} onChange={(event) => setReward(event.target.value)} inputMode="decimal" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {["0.05", "0.1", "0.5"].map((preset) => (
              <Button key={preset} variant={reward === preset ? "primary" : "ghost"} onClick={() => setReward(preset)}>
                {preset} SOL
              </Button>
            ))}
          </div>
          <Field label="Deadline">
            <TextInput type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
          </Field>
          <Field label="Attachment or dataset link" hint="Optional IPFS or HTTPS URL. File bytes are not uploaded on-chain.">
            <TextInput value={metadataUri} onChange={(event) => setMetadataUri(event.target.value)} placeholder="ipfs://… or https://…" />
          </Field>
          <p className="text-sm text-muted">
            Escrow deposit: <span className="font-mono tabular-nums text-accent">{Number.isFinite(rewardLamports) ? formatSol(rewardLamports) : "—"} SOL</span>
          </p>
          <Button type="submit" variant="accent" disabled={pending || !market.data?.platform}>
            {pending ? "Waiting for signature…" : "Deposit and create"}
          </Button>
        </Card>
      </form>
    </Shell>
  );
}
