import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";

const wallet = z.string().min(32).max(64);
const txTypes = z.enum([
  "initialize_platform",
  "initialize_reputation",
  "create_task",
  "accept_task",
  "submit_work",
  "approve_submission",
  "reject_submission",
  "cancel_task",
]);

export const upsertProfile = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        walletAddress: wallet,
        username: z
          .string()
          .trim()
          .min(2)
          .max(24)
          .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, or underscores"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    await sql`
      insert into users (wallet_address, username)
      values (${data.walletAddress}, ${data.username})
      on conflict (wallet_address) do update set username = excluded.username
    `;
    return { ok: true as const };
  });

export const getProfile = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ walletAddress: wallet }).parse(input))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<{ wallet_address: string; username: string | null; created_at: string }>`
      select wallet_address, username, created_at::text as created_at
      from users where wallet_address = ${data.walletAddress}
    `;
    return rows[0] ?? null;
  });

export const listProfiles = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  return sql<{ wallet_address: string; username: string | null }>`
    select wallet_address, username from users order by created_at desc limit 200
  `;
});

export const indexTask = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        onChainTaskId: z.string().min(1).max(32),
        creatorWallet: wallet,
        title: z.string().trim().min(1).max(80),
        description: z.string().trim().min(1).max(500),
        category: z.string().trim().min(1).max(40),
        metadataUri: z.string().trim().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    await sql`
      insert into tasks (on_chain_task_id, creator_wallet, title, description, category, metadata_uri)
      values (
        ${data.onChainTaskId},
        ${data.creatorWallet},
        ${data.title},
        ${data.description},
        ${data.category},
        ${data.metadataUri ?? null}
      )
      on conflict (on_chain_task_id) do update set
        title = excluded.title,
        description = excluded.description,
        category = excluded.category,
        metadata_uri = excluded.metadata_uri
    `;
    return { ok: true as const };
  });

export const indexSubmission = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        onChainSubmissionId: z.string().min(32).max(64),
        taskId: z.string().min(1).max(32),
        contributorWallet: wallet,
        submissionUri: z.string().trim().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    await sql`
      insert into submissions (on_chain_submission_id, task_id, contributor_wallet, submission_uri)
      values (
        ${data.onChainSubmissionId},
        ${data.taskId},
        ${data.contributorWallet},
        ${data.submissionUri}
      )
    `;
    return { ok: true as const };
  });

export const recordTransaction = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        signature: z.string().min(32).max(128),
        transactionType: txTypes,
        walletAddress: wallet,
        taskId: z.string().max(32).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    await sql`
      insert into transactions (signature, transaction_type, wallet_address, task_id)
      values (${data.signature}, ${data.transactionType}, ${data.walletAddress}, ${data.taskId ?? null})
      on conflict (signature) do nothing
    `;
    return { ok: true as const };
  });

export const listIndexedTransactions = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  return sql<{
    signature: string;
    transaction_type: string;
    wallet_address: string;
    task_id: string | null;
    created_at: string;
  }>`
    select signature, transaction_type, wallet_address, task_id, created_at::text as created_at
    from transactions
    order by created_at desc
    limit 40
  `;
});
