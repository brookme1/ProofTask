import { Buffer } from "buffer";
import { PublicKey } from "@solana/web3.js";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

/** Deployed ProofTask program (Solana devnet). */
export const PROGRAM_ID = new PublicKey("2EXa31Ao7M9BU5MhJfvMmzbgzWzRj1XdQ2sNhD6xnaUy");

/** The compiled program runs on a local validator. Public devnet faucet returns HTTP 410. */
export const CLUSTER: "local" | "devnet" = "local";

export const LOCAL_RPC = "http://127.0.0.1:8899";

export const CLUSTER_NOTE =
  "This preview pays real SOL on a local Solana validator that is running the compiled ProofTask program. The public devnet faucet is closed, so devnet itself cannot fund a wallet from here.";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export const MIN_REWARD_LAMPORTS = 100_000;

export const CATEGORIES = [
  "Image labeling",
  "Text classification",
  "Audio transcription",
  "Data categorization",
  "AI response evaluation",
  "Image verification",
  "Dataset preparation",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const TASK_STATUSES = ["Open", "Assigned", "Submitted", "Completed", "Cancelled"] as const;
export type TaskStatusName = (typeof TASK_STATUSES)[number];

export const SUBMISSION_STATUSES = ["Pending", "Approved", "Rejected"] as const;
export type SubmissionStatusName = (typeof SUBMISSION_STATUSES)[number];

export const IX = {
  initializePlatform: [119, 201, 101, 45, 75, 122, 89, 3],
  initializeReputation: [150, 240, 109, 53, 147, 42, 152, 162],
  createTask: [194, 80, 6, 180, 232, 127, 48, 171],
  acceptTask: [222, 196, 79, 165, 120, 30, 38, 120],
  submitWork: [158, 80, 101, 51, 114, 130, 101, 253],
  approveSubmission: [154, 76, 116, 120, 143, 128, 16, 205],
  rejectSubmission: [2, 92, 1, 81, 148, 156, 6, 160],
  cancelTask: [69, 228, 134, 187, 134, 105, 238, 48],
} as const;

export const ACCOUNT_DISC = {
  platform: [77, 92, 204, 58, 187, 98, 91, 12],
  task: [79, 34, 229, 55, 88, 90, 55, 84],
  submission: [58, 194, 159, 158, 75, 102, 178, 197],
  reputation: [55, 148, 90, 71, 68, 183, 193, 28],
} as const;

export function explorerTx(signature: string) {
  if (CLUSTER !== "devnet") return null;
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function explorerAddress(address: string) {
  if (CLUSTER !== "devnet") return null;
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export function shortAddress(address: string) {
  if (address.length < 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function lamportsToSol(lamports: number) {
  return lamports / 1_000_000_000;
}

export function formatSol(lamports: number, digits = 4) {
  return lamportsToSol(lamports).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}
