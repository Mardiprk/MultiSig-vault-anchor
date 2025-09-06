use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("93ht2ibZuN5AHhXchvPWhN9Rf79viZZH91UTrojUCWow");

#[program]
pub mod multisig_vault {
    use super::*;

    pub fn create_vault(
        ctx: Context<CreateVault>,
        owners: Vec<Pubkey>,
        threshold: u8,
    ) -> Result<()> {
        Ok(())
    }

    pub fn create_proposal(ctx: Context<CreateProposal>, to: Pubkey, amount: u64) -> Result<()> {
        Ok(())
    }

    pub fn approve(ctx: Context<Approve>) -> Result<()> {
        Ok(())
    }

    pub fn execute(ctx: Context<Execute>) -> Result<()> {
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        Ok(())
    }

    pub fn cancel_proposal(ctx: Context<CancelProposal>) -> Result<()> {
        Ok(())
    }
}

#[account]
pub struct Vault {
    pub owner: Vec<Pubkey>,  // list of owners pulic keys
    pub threshold: u8,       // required approvals to execute
    pub bump: u8,            // pda bump
    pub proposal_count: u64, // counter for unique proposal id
}

#[account]
#[derive(InitSpace)]
pub struct Proposal {
    pub vault: Pubkey,          // associated vault
    pub to: Pubkey,             // destination address
    pub amount: u64,            // amount to transfer in lamports
    pub approvals: Vec<Pubkey>, // list of approvers
    pub executed: bool,         // wherther peoposal was executed
    pub proposal_id: u64,       // unique proposal id
    pub bump: u8,               //pda bump
}

#[derive(Accounts)]
#[instruction(owners: Vec<Pubkey>, threshold: u8)]
pub struct CreateVault<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 4 + (32 * 10) + 1 + 1 + 8,
        seeds = [b"vault", payer.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(
        init,
        payer = proposer,
        space = 8 + 32 + 32 + 8 + 4 + (32 * 10) + 1 + 8 + 1, // all proposal fields + 10 max approvals
        seeds = [],
        bump
    )]
    pub proposal: Account<'info, Proposal>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub proposer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Approve<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    #[account(
        constraint = proposal.vault == vault.key() @ ErrorCode::InvalidVault
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Execute<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    #[account(
        mut,
        constraint = proposal.vault == vault.key() @ ErrorCode::InvalidVault
    )]
    pub vault: Account<'info, Vault>,
    /// CHECK: Destination account validated via proposal.to
    #[account(
        mut,
        constraint = to.key() == proposal.to @ ErrorCode::InvalidDestination
    )]
    pub to: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    /// CHECK: Vault account for receiving funds
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelProposal<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    #[account(
        constraint = proposal.vault == vault.key() @ ErrorCode::InvalidVault
    )]
    pub vault: Account<'info, Vault>,
    pub canceller: Signer<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid threshold: must be > 0 and <= number of owners")]
    InvalidThreshold,
    #[msg("Too many owners: maximum 10 allowed")]
    TooManyOwners,
    #[msg("Signer is not an owner of this vault")]
    NotOwner,
    #[msg("Proposal already approved by this signer")]
    AlreadyApproved,
    #[msg("Not enough approvals to execute proposal")]
    NotEnoughApprovals,
    #[msg("Proposal already executed")]
    AlreadyExecuted,
    #[msg("Vault has insufficient funds")]
    InsufficientFunds,
    #[msg("Invalid vault for this proposal")]
    InvalidVault,
    #[msg("Invalid destination address")]
    InvalidDestination,
}
