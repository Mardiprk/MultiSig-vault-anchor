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
        require!(threshold > 0, ErrorCode::InvalidThreshold);
        require!(
            threshold as usize <= owners.len(),
            ErrorCode::InvalidThreshold
        );
        require!(owners.len() <= 10, ErrorCode::TooManyOwners);

        let vault = &mut ctx.accounts.vault;
        vault.owner = owners;
        vault.threshold = threshold;
        vault.bump = ctx.bumps.vault;
        vault.proposal_count = 0;

        Ok(())
    }

    pub fn create_proposal(ctx: Context<CreateProposal>, to: Pubkey, amount: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let proposal = &mut ctx.accounts.proposal;

        require!(
            vault.owner.contains(&ctx.accounts.proposer.key()),
            ErrorCode::NotOwner
        );

        proposal.vault = vault.key();
        proposal.to = to;
        proposal.amount = amount;
        proposal.approvals = vec![];
        proposal.executed = false;
        proposal.proposal_id = vault.proposal_count;
        proposal.bump = ctx.bumps.proposal;

        vault.proposal_count += 1;

        msg!(
            "proposal {} created: {} SOL to {}",
            proposal.proposal_id,
            amount,
            to
        );
        Ok(())
    }

    pub fn approve(ctx: Context<Approve>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let signer = ctx.accounts.signer.key();

        require!(
            ctx.accounts.vault.owner.contains(&signer),
            ErrorCode::NotOwner
        );
        require!(
            !proposal.approvals.contains(&signer),
            ErrorCode::AlreadyApproved
        );
        require!(!proposal.executed, ErrorCode::AlreadyExecuted);

        proposal.approvals.push(signer);

        msg!(
            "Proposal {} approved by {} ({}/{})",
            proposal.proposal_id,
            signer,
            proposal.approvals.len(),
            ctx.accounts.vault.threshold
        );

        Ok(())
    }

    pub fn execute(ctx: Context<Execute>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let proposal = &mut ctx.accounts.proposal;
    
        require!(!proposal.executed, ErrorCode::AlreadyExecuted);
        require!(
            proposal.approvals.len() as u8 >= vault.threshold,
            ErrorCode::NotEnoughApprovals
        );
    
        // Optional: keep the vault rent-exempt
        // use anchor_lang::prelude::Rent;
        let rent = Rent::get()?;
        let data_len = ctx.accounts.vault.to_account_info().data_len();
        let min_balance = rent.minimum_balance(data_len);
    
        let vault_lamports = ctx.accounts.vault.to_account_info().lamports();
        require!(
            vault_lamports.saturating_sub(proposal.amount) >= min_balance,
            ErrorCode::InsufficientFunds
        );
    
        proposal.executed = true;
    
        // Manually move lamports (no CPI, no signer seeds needed)
        let from_info = ctx.accounts.vault.to_account_info();
        let to_info = ctx.accounts.to.to_account_info();
    
        **from_info.try_borrow_mut_lamports()? -= proposal.amount;
        **to_info.try_borrow_mut_lamports()? += proposal.amount;
    
        Ok(())
    }
    

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.depositor.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        msg!("Deposited {} SOL to vault", amount);
        Ok(())
    }

    pub fn cancel_proposal(ctx: Context<CancelProposal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(!proposal.executed, ErrorCode::AlreadyExecuted);
        require!(
            ctx.accounts
                .vault
                .owner
                .contains(&ctx.accounts.canceller.key()),
            ErrorCode::NotOwner
        );

        proposal.executed = true;

        msg!(
            "Proposal {} cancelled by {}",
            proposal.proposal_id,
            ctx.accounts.canceller.key()
        );
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
    #[max_len(10)]
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
        seeds = [b"proposal",
            vault.key().as_ref(),
            &vault.proposal_count.to_le_bytes()],
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
    #[account(
        mut,
        seeds = [
            b"proposal",
            vault.key().as_ref(),
            &proposal.proposal_id.to_le_bytes()
        ],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        seeds = [b"vault", vault_creator.key().as_ref()], // match CreateVault
        bump = vault.bump,
        constraint = proposal.vault == vault.key() @ ErrorCode::InvalidVault
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: the payer who created the vault
    pub vault_creator: UncheckedAccount<'info>,

    /// CHECK: validated against proposal.to
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
