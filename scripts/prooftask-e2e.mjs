/**
 * End-to-end against a running validator that has the ProofTask program loaded.
 * Usage: node scripts/prooftask-e2e.mjs
 */
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";

const RPC = process.env.PROOFTASK_RPC ?? "http://127.0.0.1:8899";
const PROGRAM_ID = new PublicKey("2EXa31Ao7M9BU5MhJfvMmzbgzWzRj1XdQ2sNhD6xnaUy");
const IX = {
  initializePlatform: Buffer.from([119, 201, 101, 45, 75, 122, 89, 3]),
  createTask: Buffer.from([194, 80, 6, 180, 232, 127, 48, 171]),
  acceptTask: Buffer.from([222, 196, 79, 165, 120, 30, 38, 120]),
  submitWork: Buffer.from([158, 80, 101, 51, 114, 130, 101, 253]),
  approveSubmission: Buffer.from([154, 76, 116, 120, 143, 128, 16, 205]),
};
const TASK_DISC = Buffer.from([79, 34, 229, 55, 88, 90, 55, 84]);

const connection = new Connection(RPC, "confirmed");

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}
function u64(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n), 0);
  return b;
}
function i64(n) {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(n), 0);
  return b;
}
function encStr(value) {
  return Buffer.concat([u32(Buffer.byteLength(value)), Buffer.from(value)]);
}
function pda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

async function confirm(signature, lastValidBlockHeight) {
  for (let i = 0; i < 40; i += 1) {
    const statuses = await connection.getSignatureStatuses([signature]);
    const status = statuses.value[0];
    if (status?.err) throw new Error(`${signature} failed ${JSON.stringify(status.err)}`);
    if (status && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) return;
    const height = await connection.getBlockHeight("confirmed");
    if (height > lastValidBlockHeight) throw new Error("expired");
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`timeout ${signature}`);
}

async function send(payer, ixs) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = payer.publicKey;
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  tx.sign(payer);
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await confirm(signature, latest.lastValidBlockHeight);
  return signature;
}

async function airdrop(pubkey, sol) {
  const signature = await connection.requestAirdrop(pubkey, sol * 1_000_000_000);
  const latest = await connection.getLatestBlockhash("confirmed");
  await confirm(signature, latest.lastValidBlockHeight);
}

const creator = Keypair.generate();
const contributor = Keypair.generate();
await airdrop(creator.publicKey, 5);
await airdrop(contributor.publicKey, 2);

const platform = pda([Buffer.from("platform")]);
await send(creator, [
  new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: creator.publicKey, isSigner: true, isWritable: true },
      { pubkey: platform, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: IX.initializePlatform,
  }),
]);

const taskId = 0;
const reward = 50_000_000;
const deadline = Math.floor(Date.now() / 1000) + 86400;
const task = pda([Buffer.from("task"), u64(taskId)]);
await send(creator, [
  new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: creator.publicKey, isSigner: true, isWritable: true },
      { pubkey: platform, isSigner: false, isWritable: true },
      { pubkey: task, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      IX.createTask,
      u64(taskId),
      encStr("Identify cars"),
      encStr("Image labeling"),
      encStr("Label 100 images containing cars."),
      encStr("Mark every image that contains a car."),
      u32(100),
      u64(reward),
      i64(deadline),
      encStr(""),
    ]),
  }),
]);

const reputation = pda([Buffer.from("reputation"), contributor.publicKey.toBuffer()]);
await send(contributor, [
  new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: contributor.publicKey, isSigner: true, isWritable: true },
      { pubkey: platform, isSigner: false, isWritable: true },
      { pubkey: task, isSigner: false, isWritable: true },
      { pubkey: reputation, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([IX.acceptTask, u64(taskId)]),
  }),
]);

const submission = pda([Buffer.from("submission"), task.toBuffer()]);
await send(contributor, [
  new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: contributor.publicKey, isSigner: true, isWritable: true },
      { pubkey: task, isSigner: false, isWritable: true },
      { pubkey: submission, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([IX.submitWork, u64(taskId), encStr("ipfs://cars-labeled")]),
  }),
]);

const before = await connection.getBalance(contributor.publicKey);
await send(creator, [
  new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: creator.publicKey, isSigner: true, isWritable: true },
      { pubkey: platform, isSigner: false, isWritable: true },
      { pubkey: task, isSigner: false, isWritable: true },
      { pubkey: submission, isSigner: false, isWritable: true },
      { pubkey: reputation, isSigner: false, isWritable: true },
      { pubkey: contributor.publicKey, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([IX.approveSubmission, u64(taskId)]),
  }),
]);
const after = await connection.getBalance(contributor.publicKey);
const info = await connection.getAccountInfo(task);
if (!info) throw new Error("task account missing");
if (!info.data.subarray(0, 8).equals(TASK_DISC)) throw new Error("bad task discriminator");
const status = info.data[8 + 8 + 32 + 32 + 8];
if (status !== 3) throw new Error(`expected Completed(3), got ${status}`);
const delta = after - before;
if (delta !== reward) throw new Error(`expected +${reward} lamports, got ${delta}`);
console.log(JSON.stringify({ ok: true, reward, delta, task: task.toBase58(), program: PROGRAM_ID.toBase58() }));
