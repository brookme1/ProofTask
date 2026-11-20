import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PublicKey } from "@solana/web3.js";
import { indexSubmission, recordTransaction } from "@/lib/marketplace-api";
import {
  acceptTaskIx,
  approveSubmissionIx,
  cancelTaskIx,
  rejectSubmissionIx,
  submissionPda,
  submitWorkIx,
  taskPda,
} from "@/lib/solana/codec";
import { fetchSubmission } from "@/lib/solana/chain";
import {
  byteLength,
  explorerTx,
  formatSol,
  shortAddress,
} from "@/lib/solana/config";
import { useWallet } from "@/lib/solana/wallet";
import { useMarketplace } from "./chain-state";
import { Button, Card, Field, StatusPill, TextArea, TextInput } from "./ui";

const UNASSIGNED = PublicKey.default.toBase58();

export function TaskScreen({ taskId, focusReview = false }: { taskId: string; focusReview?: boolean }) {
  const id = Number(taskId);
  const market = useMarketplace();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const task = market.data?.tasks.find((item) => item.taskId === id);
  const submission = useQuery({
    queryKey: ["submission", id],
    queryFn: () => fetchSubmission(id),
    enabled: Number.isInteger(id) && !!task && task.status !== "Open",
  });

  async function run(
    label: string,
    work: () => Promise<string>,
    type:
      | "accept_task"
      | "submit_work"
      | "approve_submission"
      | "reject_submission"
      | "cancel_task",
  ) {
    if (!wallet.activePublicKey) {
      toast.error("Choose a studio wallet or connect Phantom.");
      return;
    }
    setPending(label);
    try {
      const signature = await work();
      await recordTransaction({
        data: {
          signature,
          transactionType: type,
          walletAddress: wallet.activePublicKey.toBase58(),
          taskId: String(id),
        },
      }).catch(() => undefined);
      const explorer = explorerTx(signature);
      toast.success(label, {
        description: signature.slice(0, 18),
        ...(explorer
          ? { action: { label: "Explorer", onClick: () => window.open(explorer, "_blank", "noopener") } }
          : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ["marketplace"] });
      await queryClient.invalidateQueries({ queryKey: ["submission", id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transaction failed");
    } finally {
      setPending(null);
    }
  }

  if (!Number.isInteger(id) || id < 0) {
    return <Card><p className="text-sm text-muted">That task id is not valid.</p></Card>;
  }
  if (market.isLoading) return <Card><p className="text-sm text-muted">Loading task from the program…</p></Card>;
  if (!task) {
    return (
      <Card>
        <p className="text-sm text-fg">No on-chain task #{id}.</p>
        <Link to="/explore" className="mt-3 inline-block text-sm text-primary">Back to explore</Link>
      </Card>
    );
  }

  const me = wallet.activePublicKey?.toBase58();
  const isCreator = me === task.creator;
  const isContributor = me === task.contributor;
  const expired = Date.now() / 1000 >= task.deadline;
  const assigned = task.contributor !== UNASSIGNED;

  const submissionBody = link.trim() || note.trim();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Task #{task.taskId} · {task.category}</p>
          <h1 className="mt-1 text-3xl font-semibold">{task.title}</h1>
        </div>
        <StatusPill status={task.status} />
      </div>
      <div className="grid gap-4 md:grid-cols-[1.4fr_0.8fr]">
        <Card className="space-y-4">
          <div>
            <h2 className="text-sm font-medium text-muted">Brief</h2>
            <p className="mt-2 text-sm leading-6 text-fg">{task.description}</p>
          </div>
          <div>
            <h2 className="text-sm font-medium text-muted">Instructions</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-fg">{task.instructions}</p>
          </div>
          {task.metadataUri ? (
            <a className="inline-flex items-center gap-1 text-sm text-primary" href={task.metadataUri} target="_blank" rel="noreferrer">
              Attachment link <ExternalLink className="size-3.5" />
            </a>
          ) : null}
          {focusReview || task.submissionUri ? (
            <div>
              <h2 className="text-sm font-medium text-muted">Submission on record</h2>
              <p className="mt-2 break-all text-sm text-fg">{task.submissionUri || "Nothing submitted yet."}</p>
              {submission.data ? (
                <p className="mt-2 text-xs text-muted">
                  Submission status: {submission.data.status}. Filed {format(new Date(submission.data.submittedAt * 1000), "PPp")}.
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>
        <Card className="space-y-3">
          <p className="font-mono text-3xl tabular-nums text-accent">{formatSol(task.rewardLamports)} SOL</p>
          <p className="text-sm text-muted">Held in the task escrow until you approve.</p>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Items</dt>
              <dd className="tabular-nums">{task.requiredItems}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Deadline</dt>
              <dd>{format(new Date(task.deadline * 1000), "PPp")}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Creator</dt>
              <dd className="font-mono">{shortAddress(task.creator)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Contributor</dt>
              <dd className="font-mono">{assigned ? shortAddress(task.contributor) : "Unassigned"}</dd>
            </div>
          </dl>
          <p className="break-all font-mono text-xs text-muted">{shortAddress(task.address)}</p>
        </Card>
      </div>

      {task.status === "Open" && isCreator ? (
        <Card>
          <h2 className="text-lg font-semibold">Cancel and refund</h2>
          <p className="mt-2 text-sm text-muted">Cancellation is only possible before someone accepts. The program returns the escrow to you.</p>
          <Button className="mt-4" variant="danger" disabled={!!pending} onClick={() => void run("Task cancelled", () => wallet.send([cancelTaskIx(wallet.activePublicKey!, id)], `prooftask:cancel_task:${id}`), "cancel_task")}>
            {pending === "Task cancelled" ? "Cancelling…" : "Cancel task"}
          </Button>
        </Card>
      ) : null}

      {task.status === "Open" && !isCreator ? (
        <Card>
          <h2 className="text-lg font-semibold">Accept this task</h2>
          <p className="mt-2 text-sm text-muted">
            One contributor only. You cannot accept a task you created, and the program rejects a second acceptance.
          </p>
          <Button
            className="mt-4"
            variant="accent"
            disabled={!!pending || expired || !me}
            onClick={() => void run("Task accepted", () => wallet.send([acceptTaskIx(wallet.activePublicKey!, id)], `prooftask:accept_task:${id}`), "accept_task")}
          >
            {expired ? "Deadline passed" : pending === "Task accepted" ? "Accepting…" : "Accept task"}
          </Button>
        </Card>
      ) : null}

      {task.status === "Assigned" && isContributor ? (
        <Card>
          <h2 className="text-lg font-semibold">Submit work</h2>
          <p className="mt-2 text-sm text-muted">
            Paste an IPFS or HTTPS link, or a short note. The chain stores at most 200 bytes. Large files stay off-chain.
          </p>
          {submission.data?.status === "Rejected" ? (
            <p className="mt-3 text-sm text-danger">The last submission was rejected. Escrow is still locked. Send a correction.</p>
          ) : null}
          <div className="mt-4 space-y-4">
            <Field label="Result link" hint="ipfs:// or https:// — preferred for datasets">
              <TextInput value={link} onChange={(event) => setLink(event.target.value)} placeholder="ipfs://… or https://…" />
            </Field>
            <Field label="Short note" hint={`${byteLength(note)} / 200 bytes if you are not sending a link`}>
              <TextArea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Labels, transcript, or evaluation notes" />
            </Field>
            <Button
              variant="accent"
              disabled={!!pending || !submissionBody || byteLength(submissionBody) > 200 || expired}
              onClick={() =>
                void run(
                  "Work submitted",
                  async () => {
                    const signature = await wallet.send(
                      [submitWorkIx(wallet.activePublicKey!, id, submissionBody)],
                      `prooftask:submit_work:${id}`,
                    );
                    await indexSubmission({
                      data: {
                        onChainSubmissionId: submissionPda(taskPda(id)).toBase58(),
                        taskId: String(id),
                        contributorWallet: wallet.activePublicKey!.toBase58(),
                        submissionUri: submissionBody,
                      },
                    }).catch(() => undefined);
                    return signature;
                  },
                  "submit_work",
                )
              }
            >
              {expired ? "Deadline passed" : pending === "Work submitted" ? "Submitting…" : "Submit to the program"}
            </Button>
          </div>
        </Card>
      ) : null}

      {task.status === "Submitted" && isCreator ? (
        <Card>
          <h2 className="text-lg font-semibold">Review submission</h2>
          <p className="mt-2 text-sm text-muted">
            Approve releases {formatSol(task.rewardLamports)} SOL to the contributor and updates their on-chain reputation. Reject keeps the escrow locked and lets them resubmit.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="accent"
              disabled={!!pending}
              onClick={() =>
                void run(
                  "Payment released",
                  () =>
                    wallet.send(
                      [approveSubmissionIx(wallet.activePublicKey!, id, new PublicKey(task.contributor))],
                      `prooftask:approve_submission:${id}`,
                    ),
                  "approve_submission",
                )
              }
            >
              {pending === "Payment released" ? "Releasing…" : "Approve and pay"}
            </Button>
            <Button
              variant="danger"
              disabled={!!pending}
              onClick={() =>
                void run(
                  "Submission rejected",
                  () =>
                    wallet.send(
                      [rejectSubmissionIx(wallet.activePublicKey!, id, new PublicKey(task.contributor))],
                      `prooftask:reject_submission:${id}`,
                    ),
                  "reject_submission",
                )
              }
            >
              {pending === "Submission rejected" ? "Rejecting…" : "Reject"}
            </Button>
          </div>
        </Card>
      ) : null}

      {task.status === "Completed" ? (
        <Card>
          <p className="text-sm text-fg">This escrow is settled. The reward was paid to the contributor by the program.</p>
        </Card>
      ) : null}
    </div>
  );
}
