use anchor_lang::prelude::*;

declare_id!("93ht2ibZuN5AHhXchvPWhN9Rf79viZZH91UTrojUCWow");

#[program]
pub mod multisig_vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
