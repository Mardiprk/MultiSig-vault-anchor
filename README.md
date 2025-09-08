# 🏦 MultiSig Vault - Solana Program
<div align="center">

![Solana](https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white)
![Anchor](https://img.shields.io/badge/Anchor-FF6B6B?style=for-the-badge&logo=anchor&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)

</div>

A secure multi-signature wallet implementation on Solana using the Anchor framework. Requires multiple signatures from authorized owners before executing any transaction.

## 🎯 Overview

The MultiSig Vault ensures no single person has complete control over funds. Perfect for:
- 🏢 **Company treasuries**
- 🤝 **DAO fund management** 
- 👨‍👩‍👧‍👦 **Family trusts**
- 💼 **Investment partnerships**

## 🔧 How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        MultiSig Vault Flow                     │
└─────────────────────────────────────────────────────────────────┘

1. CREATE VAULT
   ┌─────────────┐
   │   Alice     │ ──┐
   │   (Owner)   │   │
   └─────────────┘   │
                     │
   ┌─────────────┐   │    ┌─────────────────┐
   │     Bob     │ ──┼──► │   MultiSig      │
   │   (Owner)   │   │    │    Vault        │
   └─────────────┘   │    │  (2-of-3)       │
                     │    └─────────────────┘
   ┌─────────────┐   │
   │   Charlie   │ ──┘
   │   (Owner)   │
   └─────────────┘

2. DEPOSIT FUNDS
   ┌─────────────┐    💰     ┌─────────────────┐
   │  Anyone     │ ────────► │   MultiSig      │
   │             │   SOL     │    Vault        │
   └─────────────┘           │   (10 SOL)      │
                             └─────────────────┘

3. CREATE PROPOSAL
   ┌─────────────┐           ┌─────────────────┐
   │   Alice     │ ────────► │   Proposal      │
   │ "Send 5 SOL │           │  Send 5 SOL     │
   │  to Dave"   │           │  to Dave        │
   └─────────────┘           │  Status: 0/2    │
                             └─────────────────┘

4. APPROVE PROPOSAL
   ┌─────────────┐    ✅     ┌─────────────────┐
   │     Bob     │ ────────► │   Proposal      │
   │  (Approve)  │           │  Send 5 SOL     │
   └─────────────┘           │  to Dave        │
                             │  Status: 1/2    │
   ┌─────────────┐    ✅     │                 │
   │   Charlie   │ ────────► │                 │
   │  (Approve)  │           │  Status: 2/2    │
   └─────────────┘           │  ✅ Ready!      │
                             └─────────────────┘

5. EXECUTE PROPOSAL
   ┌─────────────┐           ┌─────────────────┐    💰    ┌─────────────┐
   │   Anyone    │ ────────► │   MultiSig      │ ──────► │    Dave     │
   │  (Execute)  │           │    Vault        │  5 SOL  │             │
   └─────────────┘           │   (5 SOL)       │         └─────────────┘
                             └─────────────────┘
```

## 🚀 Quick Start

### 1. Build & Deploy

```bash
# Build the program
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

### 2. Initialize a Vault

```javascript
const owners = [
  alice.publicKey,
  bob.publicKey, 
  charlie.publicKey
];
const threshold = 2; // Require 2 out of 3 signatures

await program.methods
  .createVault(owners, threshold)
  .accounts({
    vault: vaultPda,
    payer: alice.publicKey,
  })
  .signers([alice])
  .rpc();
```

### 3. Deposit Funds

```javascript
await program.methods
  .deposit(new anchor.BN(5 * LAMPORTS_PER_SOL)) // 5 SOL
  .accounts({
    depositor: alice.publicKey,
    vault: vaultPda,
  })
  .signers([alice])
  .rpc();
```

### 4. Create Proposal

```javascript
await program.methods
  .createProposal(
    dave.publicKey, // recipient
    new anchor.BN(2 * LAMPORTS_PER_SOL) // 2 SOL
  )
  .accounts({
    proposal: proposalPda,
    vault: vaultPda,
    proposer: alice.publicKey,
  })
  .signers([alice])
  .rpc();
```

### 5. Approve & Execute

```javascript
// Bob approves
await program.methods
  .approve()
  .accounts({
    proposal: proposalPda,
    vault: vaultPda,
    signer: bob.publicKey,
  })
  .signers([bob])
  .rpc();

// Charlie approves  
await program.methods
  .approve()
  .accounts({
    proposal: proposalPda,
    vault: vaultPda,
    signer: charlie.publicKey,
  })
  .signers([charlie])
  .rpc();

// Anyone can execute once threshold is met
await program.methods
  .execute()
  .accounts({
    proposal: proposalPda,
    vault: vaultPda,
    to: dave.publicKey,
  })
  .rpc();
```

## 📋 Program Instructions

| Instruction | Description | Who Can Call |
|-------------|-------------|--------------|
| `create_vault` | Initialize a new multisig vault | Anyone |
| `deposit` | Fund the vault with SOL | Anyone |
| `create_proposal` | Propose a transaction | Vault owners only |
| `approve` | Approve a proposal | Vault owners only |
| `execute` | Execute approved proposal | Anyone |
| `cancel_proposal` | Cancel a proposal | Vault owners only |

## 🏗️ Account Structure

### Vault Account
```rust
pub struct Vault {
    pub owners: Vec<Pubkey>,        // Max 10 owners
    pub threshold: u8,              // Required signatures
    pub bump: u8,                   // PDA bump
    pub proposal_count: u64,        // Proposal counter
}
```

### Proposal Account
```rust
pub struct Proposal {
    pub vault: Pubkey,              // Associated vault
    pub to: Pubkey,                 // Destination
    pub amount: u64,                // Amount in lamports
    pub approvals: Vec<Pubkey>,     // Approver list
    pub executed: bool,             // Execution status
    pub proposal_id: u64,           // Unique ID
    pub bump: u8,                   // PDA bump
}
```

## 🛡️ Security Features

- ✅ **Multi-signature protection** - No single point of failure
- ✅ **PDA-based accounts** - Secure account derivation
- ✅ **Owner validation** - Only authorized users can act
- ✅ **Double-approval prevention** - Can't approve twice
- ✅ **Execution validation** - Balance checks before transfers
- ✅ **Immutable proposals** - Cannot be modified after creation

## ⚠️ Limitations

- Maximum 10 owners per vault
- Only supports SOL transfers (not SPL tokens)
- No proposal expiration mechanism
- Cancelled proposals cannot be reactivated

## 🧪 Testing

### Test Results ✅

| Test Case | Status | Duration | Description |
|-----------|--------|----------|-------------|
| Create Vault | ✅ PASS | 233ms | Initialize multisig vault with owners and threshold |
| Deposit into Vault | ✅ PASS | 369ms | Fund the vault with SOL tokens |
| Create Proposal | ✅ PASS | 404ms | Create a new spending proposal |
| Approve Proposal | ✅ PASS | 410ms | Approve a proposal (first approval) |
| Execute Proposal | ✅ PASS | 825ms | Execute proposal after reaching threshold |
| Cancel Proposal | ✅ PASS | 834ms | Cancel a newly created proposal |

**Total Tests:** 6/6 passing ✅  
**Total Duration:** ~3.1 seconds  
**Coverage:** All core functionality tested

### Running Tests

```bash
# Run all tests
anchor test

# Test specific file
anchor test --skip-deploy tests/multisig-vault.ts
```

## 📄 License

Mardi License - feel free to use and modify!

---

**⚡ Built with Anchor Framework on Solana**
