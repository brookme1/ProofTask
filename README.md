# ProofTask

SOL escrow for human proof of AI training data. Creators lock a reward in a task account. A contributor accepts, submits a link, and the creator approves or rejects. Approval is a program instruction: it moves the escrowed lamports to the contributor and updates reputation. The website cannot pay anyone by itself.

## Program

| | |
|---|---|
| ID | `2EXa31Ao7M9BU5MhJfvMmzbgzWzRj1XdQ2sNhD6xnaUy` |
| Source | `programs/prooftask` (Anchor 1.2 / Rust) |
| Binary | `programs/prooftask/target/deploy/prooftask.so` |

Instructions: `initialize_platform`, `initialize_reputation`, `create_task`, `accept_task`, `submit_work`, `approve_submission`, `reject_submission`, `cancel_task`.

Accounts are program-derived: platform (`platform`), task (`task` + id), submission (`submission` + task), reputation (`reputation` + wallet). The task account holds the reward. Only the creator can approve, reject, or cancel. A creator cannot accept their own task. Rejection does not move SOL. Cancel refunds only while the task is still open.

## Chain

The public devnet faucet answers `requestAirdrop` with HTTP 410, so this copy cannot fund a devnet wallet or pay the rent to deploy there. The preview runs the compiled program on a local `solana-test-validator`. Payments are real lamports on that validator, not balances invented in the browser.

Switch `CLUSTER` in `src/lib/solana/config.ts` to `"devnet"` after the program is deployed and the wallet has SOL. Explorer links turn on only in that mode.

## App

React + TanStack Start. Two studio keys (creator and contributor) live in the browser. Phantom can sign too, if the extension is on the same cluster. Postgres indexes usernames and transaction labels; the chain is the source of truth for tasks, escrow, and reputation.

1. Airdrop 1 SOL on the creator wallet.
2. Initialize the marketplace once, if the platform account does not exist.
3. Create a task. The reward leaves the creator in the same transaction.
4. Switch to the contributor wallet, airdrop, accept, and submit a link.
5. Switch back and approve. The contributor balance increases by the reward.

`node scripts/prooftask-e2e.mjs` runs that flow against `http://127.0.0.1:8899` and checks the contributor gained the exact reward.
