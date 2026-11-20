import {
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { CLUSTER, LOCAL_RPC, PROGRAM_ID } from "./config";
import {
  decodePlatform,
  decodeReputation,
  decodeSubmission,
  decodeTask,
  platformPda,
  reputationPda,
  submissionPda,
  taskPda,
  type PlatformAccount,
  type ReputationAccount,
  type SubmissionAccount,
  type TaskAccount,
} from "./codec";

function rpcEndpoint() {
  if (CLUSTER === "devnet") return "https://api.devnet.solana.com";
  if (typeof window === "undefined") return LOCAL_RPC;
  return `${window.location.origin}/api/solana-rpc`;
}

let cached: Connection | null = null;

export function getConnection() {
  if (!cached) cached = new Connection(rpcEndpoint(), "confirmed");
  return cached;
}

export type MarketplaceSnapshot = {
  deployed: boolean;
  platform: PlatformAccount | null;
  tasks: TaskAccount[];
};

async function accountBuffer(pubkey: PublicKey) {
  const info = await getConnection().getAccountInfo(pubkey, "confirmed");
  if (!info) return null;
  return Buffer.from(info.data);
}

export async function isProgramDeployed() {
  const info = await getConnection().getAccountInfo(PROGRAM_ID, "confirmed");
  return Boolean(info?.executable);
}

export async function fetchPlatform() {
  const data = await accountBuffer(platformPda());
  if (!data) return null;
  return decodePlatform(data);
}

export async function fetchTasks(): Promise<TaskAccount[]> {
  const platform = await fetchPlatform();
  if (!platform || platform.taskCount === 0) return [];
  const tasks: TaskAccount[] = [];
  const chunk = 100;
  for (let start = 0; start < platform.taskCount; start += chunk) {
    const pubs: PublicKey[] = [];
    for (let id = start; id < Math.min(platform.taskCount, start + chunk); id += 1) {
      pubs.push(taskPda(id));
    }
    const infos = await getConnection().getMultipleAccountsInfo(pubs, "confirmed");
    infos.forEach((info, index) => {
      if (!info) return;
      const decoded = decodeTask(pubs[index]!.toBase58(), Buffer.from(info.data));
      if (decoded) tasks.push(decoded);
    });
  }
  return tasks.sort((a, b) => b.taskId - a.taskId);
}

export async function loadMarketplace(): Promise<MarketplaceSnapshot> {
  const deployed = await isProgramDeployed();
  if (!deployed) return { deployed: false, platform: null, tasks: [] };
  const platform = await fetchPlatform();
  const tasks = platform ? await fetchTasks() : [];
  return { deployed: true, platform, tasks };
}

export async function fetchReputation(contributor: PublicKey): Promise<ReputationAccount | null> {
  const data = await accountBuffer(reputationPda(contributor));
  if (!data) return null;
  return decodeReputation(reputationPda(contributor).toBase58(), data);
}

export async function fetchSubmission(taskId: number): Promise<SubmissionAccount | null> {
  const data = await accountBuffer(submissionPda(taskPda(taskId)));
  if (!data) return null;
  return decodeSubmission(data);
}

export async function fetchReputations(contributors: string[]): Promise<ReputationAccount[]> {
  const unique = [...new Set(contributors.filter((key) => key !== PublicKey.default.toBase58()))];
  const pubs = unique.map((value) => reputationPda(new PublicKey(value)));
  if (pubs.length === 0) return [];
  const infos = await getConnection().getMultipleAccountsInfo(pubs, "confirmed");
  const rows: ReputationAccount[] = [];
  infos.forEach((info, index) => {
    if (!info) return;
    const decoded = decodeReputation(pubs[index]!.toBase58(), Buffer.from(info.data));
    if (decoded) rows.push(decoded);
  });
  return rows.sort((a, b) => b.reputationScore - a.reputationScore || b.totalEarned - a.totalEarned);
}

export async function fetchProgramSignatures(limit = 20) {
  return getConnection().getSignaturesForAddress(PROGRAM_ID, { limit }, "confirmed");
}

export async function getBalance(pubkey: PublicKey) {
  return getConnection().getBalance(pubkey, "confirmed");
}

async function confirmHttp(signature: string, lastValidBlockHeight: number) {
  const connection = getConnection();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const statuses = await connection.getSignatureStatuses([signature]);
    const status = statuses.value[0];
    if (status?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    }
    if (status && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) {
      return;
    }
    const height = await connection.getBlockHeight("confirmed");
    if (height > lastValidBlockHeight) {
      throw new Error("Blockhash expired before the transaction confirmed");
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("Timed out waiting for confirmation");
}

export async function requestDevnetAirdrop(pubkey: PublicKey, sol = 1) {
  const signature = await getConnection().requestAirdrop(pubkey, Math.round(sol * 1_000_000_000));
  const latest = await getConnection().getLatestBlockhash("confirmed");
  await confirmHttp(signature, latest.lastValidBlockHeight);
  return signature;
}

export async function sendWithSigner(options: {
  payer: PublicKey;
  instructions: TransactionInstruction[];
  memo: string;
  keypair?: Keypair;
  phantom?: PhantomWalletAdapter | null;
}) {
  const tx = new Transaction();
  options.instructions.forEach((instruction) => tx.add(instruction));
  tx.feePayer = options.payer;
  const latest = await getConnection().getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;

  let signature: string;
  if (options.phantom) {
    signature = await options.phantom.sendTransaction(tx, getConnection(), { preflightCommitment: "confirmed" });
  } else if (options.keypair) {
    tx.sign(options.keypair);
    signature = await getConnection().sendRawTransaction(tx.serialize(), {
      preflightCommitment: "confirmed",
      maxRetries: 3,
    });
  } else {
    throw new Error("No signer available");
  }

  await confirmHttp(signature, latest.lastValidBlockHeight);
  return signature;
}

export async function explainTxError(error: unknown) {
  if (error instanceof SendTransactionError) {
    try {
      const logs = error.logs ?? (await error.getLogs(getConnection()));
      const message = logs?.find((line) => line.includes("Error Message:"));
      if (message) return message.split("Error Message:").pop()?.trim() || message;
      if (logs && logs.length > 0) return logs.slice(-4).join(" ");
    } catch {
      /* fall through */
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Transaction failed";
}
