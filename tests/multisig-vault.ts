import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MultisigVault } from "../target/types/multisig_vault";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

describe("multisig-vault", () => {
  // Configure the client
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);
  const program = anchor.workspace.MultisigVault as Program<MultisigVault>;

  // Test keypairs
  let vaultCreator: Keypair;
  let owner1: Keypair;
  let owner2: Keypair;
  let owner3: Keypair;
  let nonOwner: Keypair;
  let recipient: Keypair;
  
  // PDAs
  let vaultPda: PublicKey;
  let vaultBump: number;
  
  // Test data
  const threshold = 2;
  const depositAmount = 5 * LAMPORTS_PER_SOL;
  const transferAmount = 2 * LAMPORTS_PER_SOL;

  beforeEach(async () => {
    // Generate fresh keypairs for each test
    vaultCreator = Keypair.generate();
    owner1 = Keypair.generate();
    owner2 = Keypair.generate();
    owner3 = Keypair.generate();
    nonOwner = Keypair.generate();
    recipient = Keypair.generate();

    // Airdrop SOL to test accounts
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(vaultCreator.publicKey, 10 * LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(owner1.publicKey, 10 * LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(owner2.publicKey, 10 * LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(owner3.publicKey, 10 * LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(nonOwner.publicKey, 10 * LAMPORTS_PER_SOL)
    );

    // Derive vault PDA
    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), vaultCreator.publicKey.toBuffer()],
      program.programId
    );
  });

  describe("Vault Creation", () => {
    it("Creates a vault with valid parameters", async () => {
      const owners = [owner1.publicKey, owner2.publicKey, owner3.publicKey];
      
      await program.methods
        .createVault(owners, threshold)
        .accounts({
          vault: vaultPda,
          payer: vaultCreator.publicKey,
        })
        .signers([vaultCreator])
        .rpc();

      const vaultAccount = await program.account.vault.fetch(vaultPda);
      
      assert.equal(vaultAccount.threshold, threshold);
      assert.equal(vaultAccount.proposalCount.toNumber(), 0);
      assert.equal(vaultAccount.bump, vaultBump);
      assert.deepEqual(
        vaultAccount.owner.map(pk => pk.toString()),
        owners.map(pk => pk.toString())
      );
    });

    it("Fails with threshold = 0", async () => {
      const owners = [owner1.publicKey, owner2.publicKey];
      
      try {
        await program.methods
          .createVault(owners, 0)
          .accounts({
            vault: vaultPda,
            payer: vaultCreator.publicKey,
          })
          .signers([vaultCreator])
          .rpc();
        assert.fail("Should have failed with threshold = 0");
      } catch (error) {
        assert.include(error.message, "Invalid threshold");
      }
    });

    it("Fails with threshold > number of owners", async () => {
      const owners = [owner1.publicKey, owner2.publicKey];
      
      try {
        await program.methods
          .createVault(owners, 3)
          .accounts({
            vault: vaultPda,
            payer: vaultCreator.publicKey,
          })
          .signers([vaultCreator])
          .rpc();
        assert.fail("Should have failed with threshold > owners");
      } catch (error) {
        assert.include(error.message, "Invalid threshold");
      }
    });

    it("Fails with more than 10 owners", async () => {
      const owners = Array.from({length: 11}, () => Keypair.generate().publicKey);
      
      try {
        await program.methods
          .createVault(owners, 5)
          .accounts({
            vault: vaultPda,
            payer: vaultCreator.publicKey,
          })
          .signers([vaultCreator])
          .rpc();
        assert.fail("Should have failed with too many owners");
      } catch (error) {
        assert.include(error.message, "Too many owners");
      }
    });
  });

  describe("Deposits", () => {
    beforeEach(async () => {
      // Create vault first
      const owners = [owner1.publicKey, owner2.publicKey, owner3.publicKey];
      await program.methods
        .createVault(owners, threshold)
        .accounts({
          vault: vaultPda,
          payer: vaultCreator.publicKey,
        })
        .signers([vaultCreator])
        .rpc();
    });

    it("Allows deposits to the vault", async () => {
      const initialBalance = await provider.connection.getBalance(vaultPda);
      
      await program.methods
        .deposit(new anchor.BN(depositAmount))
        .accounts({
          depositor: vaultCreator.publicKey,
          vault: vaultPda,
        })
        .signers([vaultCreator])
        .rpc();

      const finalBalance = await provider.connection.getBalance(vaultPda);
      assert.equal(finalBalance - initialBalance, depositAmount);
    });
  });

  describe("Proposals", () => {
    let proposalKeypair: Keypair;
    let proposalPda: PublicKey;

    beforeEach(async () => {
      // Create vault and deposit funds
      const owners = [owner1.publicKey, owner2.publicKey, owner3.publicKey];
      await program.methods
        .createVault(owners, threshold)
        .accounts({
          vault: vaultPda,
          payer: vaultCreator.publicKey,
        })
        .signers([vaultCreator])
        .rpc();

      await program.methods
        .deposit(new anchor.BN(depositAmount))
        .accounts({
          depositor: vaultCreator.publicKey,
          vault: vaultPda,
        })
        .signers([vaultCreator])
        .rpc();

      proposalKeypair = Keypair.generate();
      proposalPda = proposalKeypair.publicKey;
    });

    it("Creates a proposal by vault owner", async () => {
      await program.methods
        .createProposal(recipient.publicKey, new anchor.BN(transferAmount))
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          proposer: owner1.publicKey,
        })
        .signers([owner1, proposalKeypair])
        .rpc();

      const proposal = await program.account.proposal.fetch(proposalPda);
      
      assert.equal(proposal.vault.toString(), vaultPda.toString());
      assert.equal(proposal.to.toString(), recipient.publicKey.toString());
      assert.equal(proposal.amount.toNumber(), transferAmount);
      assert.equal(proposal.executed, false);
      assert.equal(proposal.approvals.length, 0);
      assert.equal(proposal.proposalId.toNumber(), 0);
    });

    it("Fails when non-owner tries to create proposal", async () => {
      try {
        await program.methods
          .createProposal(recipient.publicKey, new anchor.BN(transferAmount))
          .accounts({
            proposal: proposalPda,
            vault: vaultPda,
            proposer: nonOwner.publicKey,
          })
          .signers([nonOwner, proposalKeypair])
          .rpc();
        assert.fail("Should have failed with non-owner proposer");
      } catch (error) {
        assert.include(error.message, "Signer is not an owner");
      }
    });

    it("Increments proposal count", async () => {
      // Create first proposal
      await program.methods
        .createProposal(recipient.publicKey, new anchor.BN(transferAmount))
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          proposer: owner1.publicKey,
        })
        .signers([owner1, proposalKeypair])
        .rpc();

      const vault = await program.account.vault.fetch(vaultPda);
      assert.equal(vault.proposalCount.toNumber(), 1);

      // Create second proposal
      const proposal2Keypair = Keypair.generate();
      await program.methods
        .createProposal(recipient.publicKey, new anchor.BN(transferAmount))
        .accounts({
          proposal: proposal2Keypair.publicKey,
          vault: vaultPda,
          proposer: owner2.publicKey,
        })
        .signers([owner2, proposal2Keypair])
        .rpc();

      const vaultAfter = await program.account.vault.fetch(vaultPda);
      assert.equal(vaultAfter.proposalCount.toNumber(), 2);
    });
  });

  describe("Approvals", () => {
    let proposalKeypair: Keypair;
    let proposalPda: PublicKey;

    beforeEach(async () => {
      // Setup vault with funds and create a proposal
      const owners = [owner1.publicKey, owner2.publicKey, owner3.publicKey];
      await program.methods
        .createVault(owners, threshold)
        .accounts({
          vault: vaultPda,
          payer: vaultCreator.publicKey,
        })
        .signers([vaultCreator])
        .rpc();

      await program.methods
        .deposit(new anchor.BN(depositAmount))
        .accounts({
          depositor: vaultCreator.publicKey,
          vault: vaultPda,
        })
        .signers([vaultCreator])
        .rpc();

      proposalKeypair = Keypair.generate();
      proposalPda = proposalKeypair.publicKey;

      await program.methods
        .createProposal(recipient.publicKey, new anchor.BN(transferAmount))
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          proposer: owner1.publicKey,
        })
        .signers([owner1, proposalKeypair])
        .rpc();
    });

    it("Allows vault owners to approve proposals", async () => {
      await program.methods
        .approve()
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          signer: owner2.publicKey,
        })
        .signers([owner2])
        .rpc();

      const proposal = await program.account.proposal.fetch(proposalPda);
      assert.equal(proposal.approvals.length, 1);
      assert.equal(proposal.approvals[0].toString(), owner2.publicKey.toString());
    });

    it("Fails when non-owner tries to approve", async () => {
      try {
        await program.methods
          .approve()
          .accounts({
            proposal: proposalPda,
            vault: vaultPda,
            signer: nonOwner.publicKey,
          })
          .signers([nonOwner])
          .rpc();
        assert.fail("Should have failed with non-owner approval");
      } catch (error) {
        assert.include(error.message, "Signer is not an owner");
      }
    });

    it("Prevents double approval from same owner", async () => {
      // First approval
      await program.methods
        .approve()
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          signer: owner2.publicKey,
        })
        .signers([owner2])
        .rpc();

      // Second approval from same owner should fail
      try {
        await program.methods
          .approve()
          .accounts({
            proposal: proposalPda,
            vault: vaultPda,
            signer: owner2.publicKey,
          })
          .signers([owner2])
          .rpc();
        assert.fail("Should have failed with double approval");
      } catch (error) {
        assert.include(error.message, "Proposal already approved");
      }
    });

    it("Allows multiple different owners to approve", async () => {
      await program.methods
        .approve()
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          signer: owner2.publicKey,
        })
        .signers([owner2])
        .rpc();

      await program.methods
        .approve()
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          signer: owner3.publicKey,
        })
        .signers([owner3])
        .rpc();

      const proposal = await program.account.proposal.fetch(proposalPda);
      assert.equal(proposal.approvals.length, 2);
      assert.include(
        proposal.approvals.map(pk => pk.toString()),
        owner2.publicKey.toString()
      );
      assert.include(
        proposal.approvals.map(pk => pk.toString()),
        owner3.publicKey.toString()
      );
    });
  });

  describe("Execution", () => {
    let proposalKeypair: Keypair;
    let proposalPda: PublicKey;

    beforeEach(async () => {
      // Setup vault with funds and create a proposal
      const owners = [owner1.publicKey, owner2.publicKey, owner3.publicKey];
      await program.methods
        .createVault(owners, threshold)
        .accounts({
          vault: vaultPda,
          payer: vaultCreator.publicKey,
        })
        .signers([vaultCreator])
        .rpc();

      await program.methods
        .deposit(new anchor.BN(depositAmount))
        .accounts({
          depositor: vaultCreator.publicKey,
          vault: vaultPda,
        })
        .signers([vaultCreator])
        .rpc();

      proposalKeypair = Keypair.generate();
      proposalPda = proposalKeypair.publicKey;

      await program.methods
        .createProposal(recipient.publicKey, new anchor.BN(transferAmount))
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          proposer: owner1.publicKey,
        })
        .signers([owner1, proposalKeypair])
        .rpc();
    });

    it("Executes proposal with enough approvals", async () => {
      // Get initial balances
      const initialVaultBalance = await provider.connection.getBalance(vaultPda);
      const initialRecipientBalance = await provider.connection.getBalance(recipient.publicKey);

      // Approve proposal (need 2 approvals for threshold=2)
      await program.methods
        .approve()
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          signer: owner2.publicKey,
        })
        .signers([owner2])
        .rpc();

      await program.methods
        .approve()
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          signer: owner3.publicKey,
        })
        .signers([owner3])
        .rpc();

      // Execute proposal
      await program.methods
        .execute()
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          to: recipient.publicKey,
        })
        .rpc();

      // Check balances changed correctly
      const finalVaultBalance = await provider.connection.getBalance(vaultPda);
      const finalRecipientBalance = await provider.connection.getBalance(recipient.publicKey);

      assert.equal(initialVaultBalance - finalVaultBalance, transferAmount);
      assert.equal(finalRecipientBalance - initialRecipientBalance, transferAmount);

      // Check proposal marked as executed
      const proposal = await program.account.proposal.fetch(proposalPda);
      assert.equal(proposal.executed, true);
    });

    it("Fails execution without enough approvals", async () => {
      // Only one approval (need 2 for threshold=2)
      await program.methods
        .approve()
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          signer: owner2.publicKey,
        })
        .signers([owner2])
        .rpc();

      try {
        await program.methods
          .execute()
          .accounts({
            proposal: proposalPda,
            vault: vaultPda,
            to: recipient.publicKey,
          })
          .rpc();
        assert.fail("Should have failed with insufficient approvals");
      } catch (error) {
        assert.include(error.message, "Not enough approvals");
      }
    });

    it("Prevents double execution", async () => {
      // Approve and execute once
      await program.methods
        .approve()
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          signer: owner2.publicKey,
        })
        .signers([owner2])
        .rpc();

      await program.methods
        .approve()
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          signer: owner3.publicKey,
        })
        .signers([owner3])
        .rpc();

      await program.methods
        .execute()
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          to: recipient.publicKey,
        })
        .rpc();

      // Try to execute again
      try {
        await program.methods
          .execute()
          .accounts({
            proposal: proposalPda,
            vault: vaultPda,
            to: recipient.publicKey,
          })
          .rpc();
        assert.fail("Should have failed with already executed");
      } catch (error) {
        assert.include(error.message, "Proposal already executed");
      }
    });

    it("Fails execution with insufficient vault funds", async () => {
      // Create a proposal for more than vault has
      const largeAmountKeypair = Keypair.generate();
      await program.methods
        .createProposal(recipient.publicKey, new anchor.BN(10 * LAMPORTS_PER_SOL))
        .accounts({
          proposal: largeAmountKeypair.publicKey,
          vault: vaultPda,
          proposer: owner1.publicKey,
        })
        .signers([owner1, largeAmountKeypair])
        .rpc();

      // Approve it
      await program.methods
        .approve()
        .accounts({
          proposal: largeAmountKeypair.publicKey,
          vault: vaultPda,
          signer: owner2.publicKey,
        })
        .signers([owner2])
        .rpc();

      await program.methods
        .approve()
        .accounts({
          proposal: largeAmountKeypair.publicKey,
          vault: vaultPda,
          signer: owner3.publicKey,
        })
        .signers([owner3])
        .rpc();

      // Try to execute
      try {
        await program.methods
          .execute()
          .accounts({
            proposal: largeAmountKeypair.publicKey,
            vault: vaultPda,
            to: recipient.publicKey,
          })
          .rpc();
        assert.fail("Should have failed with insufficient funds");
      } catch (error) {
        assert.include(error.message, "InvalidVault");
      }
    });
  });

  describe("Cancel Proposal", () => {
    let proposalKeypair: Keypair;
    let proposalPda: PublicKey;

    beforeEach(async () => {
      // Setup vault and create proposal
      const owners = [owner1.publicKey, owner2.publicKey, owner3.publicKey];
      await program.methods
        .createVault(owners, threshold)
        .accounts({
          vault: vaultPda,
          payer: vaultCreator.publicKey,
        })
        .signers([vaultCreator])
        .rpc();

      proposalKeypair = Keypair.generate();
      proposalPda = proposalKeypair.publicKey;

      await program.methods
        .createProposal(recipient.publicKey, new anchor.BN(transferAmount))
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          proposer: owner1.publicKey,
        })
        .signers([owner1, proposalKeypair])
        .rpc();
    });

    it("Allows vault owner to cancel proposal", async () => {
      await program.methods
        .cancelProposal()
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          canceller: owner2.publicKey,
        })
        .signers([owner2])
        .rpc();

      const proposal = await program.account.proposal.fetch(proposalPda);
      assert.equal(proposal.executed, true); // Cancelled proposals are marked as executed
    });

    it("Fails when non-owner tries to cancel", async () => {
      try {
        await program.methods
          .cancelProposal()
          .accounts({
            proposal: proposalPda,
            vault: vaultPda,
            canceller: nonOwner.publicKey,
          })
          .signers([nonOwner])
          .rpc();
        assert.fail("Should have failed with non-owner canceller");
      } catch (error) {
        assert.include(error.message, "Signer is not an owner");
      }
    });

    it("Prevents cancelling already executed proposal", async () => {
      // First mark as executed by approving and executing
      await program.methods
        .deposit(new anchor.BN(depositAmount))
        .accounts({
          depositor: vaultCreator.publicKey,
          vault: vaultPda,
        })
        .signers([vaultCreator])
        .rpc();

      await program.methods
        .approve()
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          signer: owner2.publicKey,
        })
        .signers([owner2])
        .rpc();

      await program.methods
        .approve()
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          signer: owner3.publicKey,
        })
        .signers([owner3])
        .rpc();

      await program.methods
        .execute()
        .accounts({
          proposal: proposalPda,
          vault: vaultPda,
          to: recipient.publicKey,
        })
        .rpc();

      // Now try to cancel
      try {
        await program.methods
          .cancelProposal()
          .accounts({
            proposal: proposalPda,
            vault: vaultPda,
            canceller: owner1.publicKey,
          })
          .signers([owner1])
          .rpc();
        assert.fail("Should have failed with already executed");
      } catch (error) {
        assert.include(error.message, "Proposal already executed");
      }
    });
  });
});