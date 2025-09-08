import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MultisigVault } from "../target/types/multisig_vault";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

describe("multisig-vault", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);
  const program = anchor.workspace.MultisigVault as Program<MultisigVault>;

  const owner1 = provider.wallet.publicKey;
  const owner2 = Keypair.generate();
  const threshold = 2;

  let vaultPda: PublicKey;
  let vaultBump: number;

  it("Create Vault", async () => {
    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), owner1.toBuffer()],
      program.programId
    );

    await program.methods
      .createVault([owner1, owner2.publicKey], threshold)
      .accounts({
        vault: vaultPda,
        payer: owner1,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.threshold, threshold);
    assert.equal(vault.owner.length, 2);
  });

  it("Deposit into Vault", async () => {
    const amount = 1 * LAMPORTS_PER_SOL;

    await program.methods
      .deposit(new anchor.BN(amount))
      .accounts({
        depositor: owner1,
        vault: vaultPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const vaultInfo = await provider.connection.getAccountInfo(vaultPda);
    assert.ok((vaultInfo?.lamports ?? 0) >= amount);
  });

  let proposalPda: PublicKey;
  let proposalBump: number;

  it("Create Proposal", async () => {
    const vault = await program.account.vault.fetch(vaultPda);
    const proposalId = vault.proposalCount;

    [proposalPda, proposalBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        vaultPda.toBuffer(),
        new anchor.BN(proposalId).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const recipient = Keypair.generate().publicKey;
    const amount = 0.5 * LAMPORTS_PER_SOL;

    await program.methods
      .createProposal(recipient, new anchor.BN(amount))
      .accounts({
        proposal: proposalPda,
        vault: vaultPda,
        proposer: owner1,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const proposal = await program.account.proposal.fetch(proposalPda);
    assert.equal(proposal.to.toBase58(), recipient.toBase58());
    assert.equal(proposal.amount.toNumber(), amount);
    assert.equal(proposal.executed, false);
  });

  it("Approve Proposal", async () => {
    await program.methods
      .approve()
      .accounts({
        proposal: proposalPda,
        vault: vaultPda,
        signer: owner1,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const proposal = await program.account.proposal.fetch(proposalPda);
    assert.equal(proposal.approvals.length, 1);
  });

  it("Execute Proposal (after 2nd approval)", async () => {
    // Fund owner2 so they can sign
    await provider.connection.requestAirdrop(owner2.publicKey, LAMPORTS_PER_SOL);

    await program.methods
      .approve()
      .accounts({
        proposal: proposalPda,
        vault: vaultPda,
        signer: owner2.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([owner2])
      .rpc();

    const proposalBefore = await program.account.proposal.fetch(proposalPda);
    assert.equal(proposalBefore.executed, false);

    const recipient = proposalBefore.to;
    const balanceBefore = await provider.connection.getBalance(recipient);

    await program.methods
      .execute()
      .accounts({
        proposal: proposalPda,
        vault: vaultPda,
        vaultCreator: owner1, // 👈 important
        to: recipient,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();


    const proposalAfter = await program.account.proposal.fetch(proposalPda);
    assert.equal(proposalAfter.executed, true);

    const balanceAfter = await provider.connection.getBalance(recipient);
    assert.ok(balanceAfter > balanceBefore);
  });

  it("Cancel Proposal (new one)", async () => {
    const vault = await program.account.vault.fetch(vaultPda);
    const proposalId = vault.proposalCount;

    const cancelPda = PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        vaultPda.toBuffer(),
        new anchor.BN(proposalId).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];

    const recipient = Keypair.generate().publicKey;

    await program.methods
      .createProposal(recipient, new anchor.BN(1000))
      .accounts({
        proposal: cancelPda,
        vault: vaultPda,
        proposer: owner1,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .cancelProposal()
      .accounts({
        proposal: cancelPda,
        vault: vaultPda,
        canceller: owner1,
      })
      .rpc();

    const proposal = await program.account.proposal.fetch(cancelPda);
    assert.equal(proposal.executed, true);
  });
});
