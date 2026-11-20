//! ProofTask — SOL escrow for human AI microtasks.
//!
//! The program is the only authority that can move escrowed lamports.
//! Off-chain services may index metadata; they cannot approve work or pay contributors.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("2EXa31Ao7M9BU5MhJfvMmzbgzWzRj1XdQ2sNhD6xnaUy");

const TITLE_MAX: usize = 64;
const CATEGORY_MAX: usize = 32;
const DESCRIPTION_MAX: usize = 400;
const INSTRUCTIONS_MAX: usize = 400;
const METADATA_MAX: usize = 200;
const SUBMISSION_MAX: usize = 200;
const MIN_REWARD: u64 = 100_000;
const MAX_HORIZON_SECS: i64 = 366 * 24 * 60 * 60;

#[program]
pub mod prooftask {
    use super::*;

    pub fn initialize_platform(ctx: Context<InitializePlatform>) -> Result<()> {
        let platform = &mut ctx.accounts.platform;
        platform.authority = ctx.accounts.authority.key();
        platform.task_count = 0;
        platform.open_count = 0;
        platform.completed_count = 0;
        platform.total_distributed = 0;
        platform.bump = ctx.bumps.platform;
        Ok(())
    }

    pub fn initialize_reputation(ctx: Context<InitializeReputation>) -> Result<()> {
        let reputation = &mut ctx.accounts.reputation;
        reputation.contributor = ctx.accounts.contributor.key();
        reputation.completed_tasks = 0;
        reputation.rejected_submissions = 0;
        reputation.total_earned = 0;
        reputation.reputation_score = 0;
        reputation.bump = ctx.bumps.reputation;
        Ok(())
    }

    pub fn create_task(
        ctx: Context<CreateTask>,
        task_id: u64,
        title: String,
        category: String,
        description: String,
        instructions: String,
        required_items: u32,
        reward_lamports: u64,
        deadline: i64,
        metadata_uri: String,
    ) -> Result<()> {
        let clock = Clock::get()?;
        require!(task_id == ctx.accounts.platform.task_count, ProofError::BadTaskId);
        require!(reward_lamports >= MIN_REWARD, ProofError::RewardTooSmall);
        require!(required_items >= 1 && required_items <= 10_000, ProofError::BadItemCount);
        require!(deadline > clock.unix_timestamp, ProofError::DeadlineInPast);
        require!(
            deadline <= clock.unix_timestamp.saturating_add(MAX_HORIZON_SECS),
            ProofError::DeadlineTooFar
        );

        let title = clean_text(&title, TITLE_MAX, false)?;
        let category = clean_text(&category, CATEGORY_MAX, false)?;
        let description = clean_text(&description, DESCRIPTION_MAX, false)?;
        let instructions = clean_text(&instructions, INSTRUCTIONS_MAX, false)?;
        let metadata_uri = clean_text(&metadata_uri, METADATA_MAX, true)?;

        let task = &mut ctx.accounts.task;
        task.task_id = task_id;
        task.creator = ctx.accounts.creator.key();
        task.contributor = Pubkey::default();
        task.reward_lamports = reward_lamports;
        task.status = TaskStatus::Open;
        task.created_at = clock.unix_timestamp;
        task.deadline = deadline;
        task.required_items = required_items;
        task.bump = ctx.bumps.task;
        task.title = title;
        task.category = category;
        task.description = description;
        task.instructions = instructions;
        task.metadata_uri = metadata_uri;
        task.submission_uri = String::new();

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                system_program::Transfer {
                    from: ctx.accounts.creator.to_account_info(),
                    to: ctx.accounts.task.to_account_info(),
                },
            ),
            reward_lamports,
        )?;

        let platform = &mut ctx.accounts.platform;
        platform.task_count = platform
            .task_count
            .checked_add(1)
            .ok_or(ProofError::MathOverflow)?;
        platform.open_count = platform
            .open_count
            .checked_add(1)
            .ok_or(ProofError::MathOverflow)?;

        emit!(TaskCreated {
            task_id,
            creator: ctx.accounts.creator.key(),
            reward_lamports,
            deadline,
        });
        Ok(())
    }

    pub fn accept_task(ctx: Context<AcceptTask>, task_id: u64) -> Result<()> {
        let clock = Clock::get()?;
        let contributor = ctx.accounts.contributor.key();
        let task = &mut ctx.accounts.task;

        require!(task.task_id == task_id, ProofError::BadTaskId);
        require!(task.status == TaskStatus::Open, ProofError::TaskNotOpen);
        require_keys_neq!(contributor, task.creator, ProofError::CreatorCannotAccept);
        require!(task.contributor == Pubkey::default(), ProofError::AlreadyAssigned);
        require!(clock.unix_timestamp < task.deadline, ProofError::TaskExpired);

        task.contributor = contributor;
        task.status = TaskStatus::Assigned;

        let reputation = &mut ctx.accounts.reputation;
        if reputation.contributor == Pubkey::default() {
            reputation.contributor = contributor;
            reputation.completed_tasks = 0;
            reputation.rejected_submissions = 0;
            reputation.total_earned = 0;
            reputation.reputation_score = 0;
            reputation.bump = ctx.bumps.reputation;
        }

        let platform = &mut ctx.accounts.platform;
        platform.open_count = platform
            .open_count
            .checked_sub(1)
            .ok_or(ProofError::MathOverflow)?;

        emit!(TaskAccepted {
            task_id,
            contributor,
        });
        Ok(())
    }

    pub fn submit_work(ctx: Context<SubmitWork>, task_id: u64, submission_uri: String) -> Result<()> {
        let clock = Clock::get()?;
        let uri = clean_text(&submission_uri, SUBMISSION_MAX, false)?;
        let contributor = ctx.accounts.contributor.key();
        let task_key = ctx.accounts.task.key();

        {
            let task = &ctx.accounts.task;
            require!(task.task_id == task_id, ProofError::BadTaskId);
            require_keys_eq!(contributor, task.contributor, ProofError::NotAssignee);
            require!(task.status == TaskStatus::Assigned, ProofError::TaskNotAssigned);
            require!(clock.unix_timestamp < task.deadline, ProofError::TaskExpired);
        }

        let submission = &mut ctx.accounts.submission;
        if submission.task == Pubkey::default() {
            submission.task = task_key;
            submission.contributor = contributor;
            submission.bump = ctx.bumps.submission;
        }
        require_keys_eq!(submission.task, task_key, ProofError::BadSubmission);
        require_keys_eq!(submission.contributor, contributor, ProofError::BadSubmission);
        require!(
            submission.status != SubmissionStatus::Approved,
            ProofError::AlreadySettled
        );

        submission.submission_uri = uri.clone();
        submission.status = SubmissionStatus::Pending;
        submission.submitted_at = clock.unix_timestamp;

        let task = &mut ctx.accounts.task;
        task.submission_uri = uri;
        task.status = TaskStatus::Submitted;

        emit!(WorkSubmitted {
            task_id,
            contributor,
        });
        Ok(())
    }

    pub fn approve_submission(ctx: Context<ApproveSubmission>, task_id: u64) -> Result<()> {
        let creator = ctx.accounts.creator.key();
        let reward = {
            let task = &ctx.accounts.task;
            require!(task.task_id == task_id, ProofError::BadTaskId);
            require_keys_eq!(creator, task.creator, ProofError::NotCreator);
            require!(task.status == TaskStatus::Submitted, ProofError::TaskNotSubmitted);
            require_keys_eq!(
                ctx.accounts.contributor_wallet.key(),
                task.contributor,
                ProofError::NotAssignee
            );
            task.reward_lamports
        };
        {
            let submission = &ctx.accounts.submission;
            require_keys_eq!(submission.task, ctx.accounts.task.key(), ProofError::BadSubmission);
            require_keys_eq!(
                submission.contributor,
                ctx.accounts.task.contributor,
                ProofError::BadSubmission
            );
            require!(
                submission.status == SubmissionStatus::Pending,
                ProofError::SubmissionNotPending
            );
        }

        // Status flips before the transfer. The whole instruction is atomic:
        // a failed debit reverts the status change, so payment cannot double-settle.
        ctx.accounts.task.status = TaskStatus::Completed;
        ctx.accounts.submission.status = SubmissionStatus::Approved;

        pay_from_escrow(
            &ctx.accounts.task.to_account_info(),
            &ctx.accounts.contributor_wallet.to_account_info(),
            reward,
        )?;

        let reputation = &mut ctx.accounts.reputation;
        require_keys_eq!(
            reputation.contributor,
            ctx.accounts.task.contributor,
            ProofError::BadReputation
        );
        reputation.completed_tasks = reputation
            .completed_tasks
            .checked_add(1)
            .ok_or(ProofError::MathOverflow)?;
        reputation.total_earned = reputation
            .total_earned
            .checked_add(reward)
            .ok_or(ProofError::MathOverflow)?;
        reputation.reputation_score =
            score(reputation.completed_tasks, reputation.rejected_submissions)?;

        let platform = &mut ctx.accounts.platform;
        platform.completed_count = platform
            .completed_count
            .checked_add(1)
            .ok_or(ProofError::MathOverflow)?;
        platform.total_distributed = platform
            .total_distributed
            .checked_add(reward)
            .ok_or(ProofError::MathOverflow)?;

        emit!(SubmissionApproved {
            task_id,
            contributor: ctx.accounts.task.contributor,
            reward_lamports: reward,
        });
        Ok(())
    }

    pub fn reject_submission(ctx: Context<RejectSubmission>, task_id: u64) -> Result<()> {
        let creator = ctx.accounts.creator.key();
        {
            let task = &ctx.accounts.task;
            require!(task.task_id == task_id, ProofError::BadTaskId);
            require_keys_eq!(creator, task.creator, ProofError::NotCreator);
            require!(task.status == TaskStatus::Submitted, ProofError::TaskNotSubmitted);
        }
        {
            let submission = &ctx.accounts.submission;
            require!(
                submission.status == SubmissionStatus::Pending,
                ProofError::SubmissionNotPending
            );
            require_keys_eq!(
                submission.contributor,
                ctx.accounts.task.contributor,
                ProofError::BadSubmission
            );
        }

        // Rejection never moves SOL. The assignee may submit a correction.
        ctx.accounts.submission.status = SubmissionStatus::Rejected;
        ctx.accounts.task.status = TaskStatus::Assigned;

        let reputation = &mut ctx.accounts.reputation;
        require_keys_eq!(
            reputation.contributor,
            ctx.accounts.task.contributor,
            ProofError::BadReputation
        );
        reputation.rejected_submissions = reputation
            .rejected_submissions
            .checked_add(1)
            .ok_or(ProofError::MathOverflow)?;
        reputation.reputation_score =
            score(reputation.completed_tasks, reputation.rejected_submissions)?;

        emit!(SubmissionRejected {
            task_id,
            contributor: ctx.accounts.task.contributor,
        });
        Ok(())
    }

    /// Refund escrow only while the task is still unassigned.
    pub fn cancel_task(ctx: Context<CancelTask>, task_id: u64) -> Result<()> {
        let creator = ctx.accounts.creator.key();
        let reward = {
            let task = &ctx.accounts.task;
            require!(task.task_id == task_id, ProofError::BadTaskId);
            require_keys_eq!(creator, task.creator, ProofError::NotCreator);
            require!(task.status == TaskStatus::Open, ProofError::CancelNotAllowed);
            task.reward_lamports
        };

        ctx.accounts.task.status = TaskStatus::Cancelled;
        pay_from_escrow(
            &ctx.accounts.task.to_account_info(),
            &ctx.accounts.creator.to_account_info(),
            reward,
        )?;

        let platform = &mut ctx.accounts.platform;
        platform.open_count = platform
            .open_count
            .checked_sub(1)
            .ok_or(ProofError::MathOverflow)?;

        emit!(TaskCancelled { task_id });
        Ok(())
    }
}

fn clean_text(value: &str, max: usize, allow_empty: bool) -> Result<String> {
    let trimmed = value.trim();
    require!(trimmed.len() <= max, ProofError::TextTooLong);
    require!(allow_empty || !trimmed.is_empty(), ProofError::TextRequired);
    require!(
        trimmed.chars().all(|c| c == '\n' || c == '\t' || !c.is_control()),
        ProofError::BadText
    );
    Ok(trimmed.to_string())
}

fn score(completed: u64, rejected: u64) -> Result<i64> {
    let completed = i64::try_from(completed).map_err(|_| error!(ProofError::MathOverflow))?;
    let rejected = i64::try_from(rejected).map_err(|_| error!(ProofError::MathOverflow))?;
    let earned = completed
        .checked_mul(100)
        .ok_or(ProofError::MathOverflow)?;
    let penalty = rejected.checked_mul(25).ok_or(ProofError::MathOverflow)?;
    Ok(earned.checked_sub(penalty).ok_or(ProofError::MathOverflow)?.max(0))
}

fn pay_from_escrow(escrow: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    require!(amount > 0, ProofError::ZeroAmount);
    let rent = Rent::get()?;
    let minimum = rent.minimum_balance(escrow.data_len());
    let from_after = escrow
        .lamports()
        .checked_sub(amount)
        .ok_or(ProofError::InsufficientEscrow)?;
    require!(from_after >= minimum, ProofError::InsufficientEscrow);
    let to_after = to
        .lamports()
        .checked_add(amount)
        .ok_or(ProofError::MathOverflow)?;
    **escrow.try_borrow_mut_lamports()? = from_after;
    **to.try_borrow_mut_lamports()? = to_after;
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TaskStatus {
    Open,
    Assigned,
    Submitted,
    Completed,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum SubmissionStatus {
    Pending,
    Approved,
    Rejected,
}

#[account]
#[derive(InitSpace)]
pub struct Platform {
    pub authority: Pubkey,
    pub task_count: u64,
    pub open_count: u64,
    pub completed_count: u64,
    pub total_distributed: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Task {
    pub task_id: u64,
    pub creator: Pubkey,
    pub contributor: Pubkey,
    pub reward_lamports: u64,
    pub status: TaskStatus,
    pub created_at: i64,
    pub deadline: i64,
    pub required_items: u32,
    pub bump: u8,
    #[max_len(64)]
    pub title: String,
    #[max_len(32)]
    pub category: String,
    #[max_len(400)]
    pub description: String,
    #[max_len(400)]
    pub instructions: String,
    #[max_len(200)]
    pub metadata_uri: String,
    #[max_len(200)]
    pub submission_uri: String,
}

#[account]
#[derive(InitSpace)]
pub struct Submission {
    pub task: Pubkey,
    pub contributor: Pubkey,
    pub status: SubmissionStatus,
    pub submitted_at: i64,
    pub bump: u8,
    #[max_len(200)]
    pub submission_uri: String,
}

#[account]
#[derive(InitSpace)]
pub struct Reputation {
    pub contributor: Pubkey,
    pub completed_tasks: u64,
    pub rejected_submissions: u64,
    pub total_earned: u64,
    pub reputation_score: i64,
    pub bump: u8,
}

#[event]
pub struct TaskCreated {
    pub task_id: u64,
    pub creator: Pubkey,
    pub reward_lamports: u64,
    pub deadline: i64,
}

#[event]
pub struct TaskAccepted {
    pub task_id: u64,
    pub contributor: Pubkey,
}

#[event]
pub struct WorkSubmitted {
    pub task_id: u64,
    pub contributor: Pubkey,
}

#[event]
pub struct SubmissionApproved {
    pub task_id: u64,
    pub contributor: Pubkey,
    pub reward_lamports: u64,
}

#[event]
pub struct SubmissionRejected {
    pub task_id: u64,
    pub contributor: Pubkey,
}

#[event]
pub struct TaskCancelled {
    pub task_id: u64,
}

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Platform::INIT_SPACE,
        seeds = [b"platform"],
        bump
    )]
    pub platform: Account<'info, Platform>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeReputation<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,
    #[account(
        init,
        payer = contributor,
        space = 8 + Reputation::INIT_SPACE,
        seeds = [b"reputation".as_ref(), contributor.key().as_ref()],
        bump
    )]
    pub reputation: Account<'info, Reputation>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct CreateTask<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [b"platform"], bump = platform.bump)]
    pub platform: Account<'info, Platform>,
    #[account(
        init,
        payer = creator,
        space = 8 + Task::INIT_SPACE,
        seeds = [b"task".as_ref(), task_id.to_le_bytes().as_ref()],
        bump
    )]
    pub task: Account<'info, Task>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct AcceptTask<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,
    #[account(mut, seeds = [b"platform"], bump = platform.bump)]
    pub platform: Account<'info, Platform>,
    #[account(
        mut,
        seeds = [b"task".as_ref(), task_id.to_le_bytes().as_ref()],
        bump = task.bump
    )]
    pub task: Account<'info, Task>,
    #[account(
        init_if_needed,
        payer = contributor,
        space = 8 + Reputation::INIT_SPACE,
        seeds = [b"reputation".as_ref(), contributor.key().as_ref()],
        bump
    )]
    pub reputation: Account<'info, Reputation>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct SubmitWork<'info> {
    #[account(mut)]
    pub contributor: Signer<'info>,
    #[account(
        mut,
        seeds = [b"task".as_ref(), task_id.to_le_bytes().as_ref()],
        bump = task.bump
    )]
    pub task: Account<'info, Task>,
    #[account(
        init_if_needed,
        payer = contributor,
        space = 8 + Submission::INIT_SPACE,
        seeds = [b"submission".as_ref(), task.key().as_ref()],
        bump
    )]
    pub submission: Account<'info, Submission>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct ApproveSubmission<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [b"platform"], bump = platform.bump)]
    pub platform: Account<'info, Platform>,
    #[account(
        mut,
        seeds = [b"task".as_ref(), task_id.to_le_bytes().as_ref()],
        bump = task.bump
    )]
    pub task: Account<'info, Task>,
    #[account(
        mut,
        seeds = [b"submission".as_ref(), task.key().as_ref()],
        bump = submission.bump
    )]
    pub submission: Account<'info, Submission>,
    #[account(
        mut,
        seeds = [b"reputation".as_ref(), task.contributor.as_ref()],
        bump = reputation.bump
    )]
    pub reputation: Account<'info, Reputation>,
    /// CHECK: System wallet credited with escrowed SOL. The address constraint
    /// forces it to be the assigned contributor, so a creator cannot redirect payment.
    #[account(mut, address = task.contributor @ ProofError::NotAssignee)]
    pub contributor_wallet: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct RejectSubmission<'info> {
    pub creator: Signer<'info>,
    #[account(
        mut,
        seeds = [b"task".as_ref(), task_id.to_le_bytes().as_ref()],
        bump = task.bump
    )]
    pub task: Account<'info, Task>,
    #[account(
        mut,
        seeds = [b"submission".as_ref(), task.key().as_ref()],
        bump = submission.bump
    )]
    pub submission: Account<'info, Submission>,
    #[account(
        mut,
        seeds = [b"reputation".as_ref(), task.contributor.as_ref()],
        bump = reputation.bump
    )]
    pub reputation: Account<'info, Reputation>,
}

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct CancelTask<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [b"platform"], bump = platform.bump)]
    pub platform: Account<'info, Platform>,
    #[account(
        mut,
        seeds = [b"task".as_ref(), task_id.to_le_bytes().as_ref()],
        bump = task.bump
    )]
    pub task: Account<'info, Task>,
}

#[error_code]
pub enum ProofError {
    #[msg("Task id does not match the platform counter")]
    BadTaskId,
    #[msg("Reward is below the minimum")]
    RewardTooSmall,
    #[msg("Required item count is out of range")]
    BadItemCount,
    #[msg("Deadline must be in the future")]
    DeadlineInPast,
    #[msg("Deadline is too far in the future")]
    DeadlineTooFar,
    #[msg("Text is required")]
    TextRequired,
    #[msg("Text is too long")]
    TextTooLong,
    #[msg("Text contains disallowed control characters")]
    BadText,
    #[msg("Task is not open")]
    TaskNotOpen,
    #[msg("Creators cannot accept their own task")]
    CreatorCannotAccept,
    #[msg("Task already has a contributor")]
    AlreadyAssigned,
    #[msg("Task deadline has passed")]
    TaskExpired,
    #[msg("Only the assigned contributor can submit")]
    NotAssignee,
    #[msg("Task is not in the assigned state")]
    TaskNotAssigned,
    #[msg("Submission account does not match this task")]
    BadSubmission,
    #[msg("Submission is already settled")]
    AlreadySettled,
    #[msg("Only the task creator can do this")]
    NotCreator,
    #[msg("Task has no pending submission")]
    TaskNotSubmitted,
    #[msg("Submission is not pending")]
    SubmissionNotPending,
    #[msg("Reputation account does not match the contributor")]
    BadReputation,
    #[msg("Escrow does not have the reward on top of rent")]
    InsufficientEscrow,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Checked math failed")]
    MathOverflow,
    #[msg("Assigned tasks cannot be cancelled")]
    CancelNotAllowed,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reputation_score_rewards_completion_and_penalizes_rejection() {
        assert_eq!(score(0, 0).unwrap(), 0);
        assert_eq!(score(2, 0).unwrap(), 200);
        assert_eq!(score(2, 1).unwrap(), 175);
        assert_eq!(score(0, 3).unwrap(), 0);
    }

    #[test]
    fn text_rules_trim_and_reject_overflow() {
        assert_eq!(clean_text("  cars  ", 64, false).unwrap(), "cars");
        assert!(clean_text("   ", 64, false).is_err());
        assert!(clean_text("", 8, true).is_ok());
        assert!(clean_text("abcdefghi", 8, false).is_err());
        assert!(clean_text("bad\u{0001}text", 64, false).is_err());
    }
}
