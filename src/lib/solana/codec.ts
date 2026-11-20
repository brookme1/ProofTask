import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import {
  ACCOUNT_DISC,
  IX,
  MEMO_PROGRAM_ID,
  PROGRAM_ID,
  type SubmissionStatusName,
  type TaskStatusName,
} from "./config";

const text = new TextDecoder();

export type PlatformAccount = {
  authority: string;
  taskCount: number;
  openCount: number;
  completedCount: number;
  totalDistributed: number;
  bump: number;
};

export type TaskAccount = {
  address: string;
  taskId: number;
  creator: string;
  contributor: string;
  rewardLamports: number;
  status: TaskStatusName;
  createdAt: number;
  deadline: number;
  requiredItems: number;
  bump: number;
  title: string;
  category: string;
  description: string;
  instructions: string;
  metadataUri: string;
  submissionUri: string;
};

export type SubmissionAccount = {
  task: string;
  contributor: string;
  status: SubmissionStatusName;
  submittedAt: number;
  bump: number;
  submissionUri: string;
};

export type ReputationAccount = {
  address: string;
  contributor: string;
  completedTasks: number;
  rejectedSubmissions: number;
  totalEarned: number;
  reputationScore: number;
  bump: number;
};

function disc(bytes: readonly number[]) {
  return Buffer.from(bytes);
}

function u32(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

function u64(n: number) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n), 0);
  return b;
}

function i64(n: number) {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(n), 0);
  return b;
}

function encStr(value: string) {
  const body = Buffer.from(value, "utf8");
  return Buffer.concat([u32(body.length), body]);
}

function readU32(buf: Buffer, offset: number): [number, number] {
  return [buf.readUInt32LE(offset), offset + 4];
}

function readU64(buf: Buffer, offset: number): [number, number] {
  return [Number(buf.readBigUInt64LE(offset)), offset + 8];
}

function readI64(buf: Buffer, offset: number): [number, number] {
  return [Number(buf.readBigInt64LE(offset)), offset + 8];
}

function readPubkey(buf: Buffer, offset: number): [string, number] {
  const raw = buf.subarray(offset, offset + 32);
  return [new PublicKey(raw).toBase58(), offset + 32];
}

function readString(buf: Buffer, offset: number): [string, number] {
  const [len, next] = readU32(buf, offset);
  const end = next + len;
  if (end > buf.length) throw new Error("Account string overruns data");
  return [text.decode(buf.subarray(next, end)), end];
}

function startsWith(buf: Buffer, prefix: readonly number[]) {
  return prefix.every((byte, index) => buf[index] === byte);
}

export function platformPda() {
  return PublicKey.findProgramAddressSync([Buffer.from("platform")], PROGRAM_ID)[0];
}

export function taskPda(taskId: number) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("task"), u64(taskId)],
    PROGRAM_ID,
  )[0];
}

export function reputationPda(contributor: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), contributor.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function submissionPda(task: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("submission"), task.toBuffer()],
    PROGRAM_ID,
  )[0];
}

export function decodePlatform(data: Buffer): PlatformAccount | null {
  if (!startsWith(data, ACCOUNT_DISC.platform) || data.length < 8 + 32 + 8 * 4 + 1) return null;
  let offset = 8;
  let authority: string;
  [authority, offset] = readPubkey(data, offset);
  let taskCount: number;
  let openCount: number;
  let completedCount: number;
  let totalDistributed: number;
  [taskCount, offset] = readU64(data, offset);
  [openCount, offset] = readU64(data, offset);
  [completedCount, offset] = readU64(data, offset);
  [totalDistributed, offset] = readU64(data, offset);
  return {
    authority,
    taskCount,
    openCount,
    completedCount,
    totalDistributed,
    bump: data[offset] ?? 0,
  };
}

export function decodeTask(address: string, data: Buffer): TaskAccount | null {
  if (!startsWith(data, ACCOUNT_DISC.task)) return null;
  let offset = 8;
  let taskId: number;
  let creator: string;
  let contributor: string;
  let rewardLamports: number;
  let createdAt: number;
  let deadline: number;
  let requiredItems: number;
  let title: string;
  let category: string;
  let description: string;
  let instructions: string;
  let metadataUri: string;
  let submissionUri: string;
  [taskId, offset] = readU64(data, offset);
  [creator, offset] = readPubkey(data, offset);
  [contributor, offset] = readPubkey(data, offset);
  [rewardLamports, offset] = readU64(data, offset);
  const status = (["Open", "Assigned", "Submitted", "Completed", "Cancelled"] as const)[data[offset] ?? 0];
  offset += 1;
  if (!status) return null;
  [createdAt, offset] = readI64(data, offset);
  [deadline, offset] = readI64(data, offset);
  [requiredItems, offset] = readU32(data, offset);
  const bump = data[offset] ?? 0;
  offset += 1;
  [title, offset] = readString(data, offset);
  [category, offset] = readString(data, offset);
  [description, offset] = readString(data, offset);
  [instructions, offset] = readString(data, offset);
  [metadataUri, offset] = readString(data, offset);
  [submissionUri, offset] = readString(data, offset);
  return {
    address,
    taskId,
    creator,
    contributor,
    rewardLamports,
    status,
    createdAt,
    deadline,
    requiredItems,
    bump,
    title,
    category,
    description,
    instructions,
    metadataUri,
    submissionUri,
  };
}

export function decodeSubmission(data: Buffer): SubmissionAccount | null {
  if (!startsWith(data, ACCOUNT_DISC.submission)) return null;
  let offset = 8;
  let task: string;
  let contributor: string;
  let submittedAt: number;
  let submissionUri: string;
  [task, offset] = readPubkey(data, offset);
  [contributor, offset] = readPubkey(data, offset);
  const status = (["Pending", "Approved", "Rejected"] as const)[data[offset] ?? 0];
  offset += 1;
  if (!status) return null;
  [submittedAt, offset] = readI64(data, offset);
  const bump = data[offset] ?? 0;
  offset += 1;
  [submissionUri, offset] = readString(data, offset);
  return { task, contributor, status, submittedAt, bump, submissionUri };
}

export function decodeReputation(address: string, data: Buffer): ReputationAccount | null {
  if (!startsWith(data, ACCOUNT_DISC.reputation) || data.length < 8 + 32 + 8 * 4 + 1) return null;
  let offset = 8;
  let contributor: string;
  let completedTasks: number;
  let rejectedSubmissions: number;
  let totalEarned: number;
  let reputationScore: number;
  [contributor, offset] = readPubkey(data, offset);
  [completedTasks, offset] = readU64(data, offset);
  [rejectedSubmissions, offset] = readU64(data, offset);
  [totalEarned, offset] = readU64(data, offset);
  [reputationScore, offset] = readI64(data, offset);
  return {
    address,
    contributor,
    completedTasks,
    rejectedSubmissions,
    totalEarned,
    reputationScore,
    bump: data[offset] ?? 0,
  };
}

function keys(
  entries: Array<{ pubkey: PublicKey; isSigner?: boolean; isWritable?: boolean }>,
) {
  return entries.map((entry) => ({
    pubkey: entry.pubkey,
    isSigner: entry.isSigner ?? false,
    isWritable: entry.isWritable ?? false,
  }));
}

export function memoIx(signer: PublicKey, message: string) {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data: Buffer.from(message.slice(0, 180), "utf8"),
  });
}

export function initializePlatformIx(authority: PublicKey) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: keys([
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: platformPda(), isWritable: true },
      { pubkey: SystemProgram.programId },
    ]),
    data: disc(IX.initializePlatform),
  });
}

export function initializeReputationIx(contributor: PublicKey) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: keys([
      { pubkey: contributor, isSigner: true, isWritable: true },
      { pubkey: reputationPda(contributor), isWritable: true },
      { pubkey: SystemProgram.programId },
    ]),
    data: disc(IX.initializeReputation),
  });
}

export type CreateTaskInput = {
  taskId: number;
  title: string;
  category: string;
  description: string;
  instructions: string;
  requiredItems: number;
  rewardLamports: number;
  deadline: number;
  metadataUri: string;
};

export function createTaskIx(creator: PublicKey, input: CreateTaskInput) {
  const data = Buffer.concat([
    disc(IX.createTask),
    u64(input.taskId),
    encStr(input.title),
    encStr(input.category),
    encStr(input.description),
    encStr(input.instructions),
    u32(input.requiredItems),
    u64(input.rewardLamports),
    i64(input.deadline),
    encStr(input.metadataUri),
  ]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: keys([
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: platformPda(), isWritable: true },
      { pubkey: taskPda(input.taskId), isWritable: true },
      { pubkey: SystemProgram.programId },
    ]),
    data,
  });
}

export function acceptTaskIx(contributor: PublicKey, taskId: number) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: keys([
      { pubkey: contributor, isSigner: true, isWritable: true },
      { pubkey: platformPda(), isWritable: true },
      { pubkey: taskPda(taskId), isWritable: true },
      { pubkey: reputationPda(contributor), isWritable: true },
      { pubkey: SystemProgram.programId },
    ]),
    data: Buffer.concat([disc(IX.acceptTask), u64(taskId)]),
  });
}

export function submitWorkIx(contributor: PublicKey, taskId: number, submissionUri: string) {
  const task = taskPda(taskId);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: keys([
      { pubkey: contributor, isSigner: true, isWritable: true },
      { pubkey: task, isWritable: true },
      { pubkey: submissionPda(task), isWritable: true },
      { pubkey: SystemProgram.programId },
    ]),
    data: Buffer.concat([disc(IX.submitWork), u64(taskId), encStr(submissionUri)]),
  });
}

export function approveSubmissionIx(creator: PublicKey, taskId: number, contributor: PublicKey) {
  const task = taskPda(taskId);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: keys([
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: platformPda(), isWritable: true },
      { pubkey: task, isWritable: true },
      { pubkey: submissionPda(task), isWritable: true },
      { pubkey: reputationPda(contributor), isWritable: true },
      { pubkey: contributor, isWritable: true },
    ]),
    data: Buffer.concat([disc(IX.approveSubmission), u64(taskId)]),
  });
}

export function rejectSubmissionIx(creator: PublicKey, taskId: number, contributor: PublicKey) {
  const task = taskPda(taskId);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: keys([
      { pubkey: creator, isSigner: true, isWritable: false },
      { pubkey: task, isWritable: true },
      { pubkey: submissionPda(task), isWritable: true },
      { pubkey: reputationPda(contributor), isWritable: true },
    ]),
    data: Buffer.concat([disc(IX.rejectSubmission), u64(taskId)]),
  });
}

export function cancelTaskIx(creator: PublicKey, taskId: number) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: keys([
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: platformPda(), isWritable: true },
      { pubkey: taskPda(taskId), isWritable: true },
    ]),
    data: Buffer.concat([disc(IX.cancelTask), u64(taskId)]),
  });
}
