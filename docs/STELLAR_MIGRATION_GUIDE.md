# LancePay Stellar Migration Guide

## Overview

This guide documents the migration from **Base Network + Privy** to **Stellar Network** for LancePay's payment infrastructure. The Stellar migration provides better African market fit, lower costs, and direct integration with existing Nigerian off-ramp providers like Yellow Card.

---

## Table of Contents

1. [Architecture Changes](#architecture-changes)
2. [What to Remove](#what-to-remove)
3. [What to Add](#what-to-add)
4. [Wallet Provider Options](#wallet-provider-options)
5. [Technical Implementation](#technical-implementation)
6. [Database Schema Changes](#database-schema-changes)
7. [API Changes Required](#api-changes-required)
8. [Frontend Changes](#frontend-changes)
9. [XLM Reserve Requirements](#xlm-reserve-requirements)
10. [Migration Checklist](#migration-checklist)

---

## Architecture Changes

### Current Architecture (Base Network)
```
Client Payment → MoonPay → USDC on Base → Privy Wallet → (Custom Off-ramp)
```

### New Architecture (Stellar Network)
```
Client Payment → MoonPay/Yellow Card → USDC on Stellar → Stellar Wallet → Yellow Card Off-ramp → Nigerian Bank
```

**Key Benefits:**
- ✅ Direct integration with Yellow Card (20 African countries)
- ✅ Lower transaction costs (<$0.01 vs $0.01-0.05)
- ✅ Faster finality (3-5 seconds)
- ✅ Native multi-currency support (path payments)
- ✅ 475,000+ on/off-ramp access points worldwide

---

## What to Remove

### 1. Dependencies to Remove

```bash
npm uninstall viem @solana/kit @solana-program/system @solana-program/token
```

**Remove from package.json:**
- `viem` (Ethereum/Base chain interaction)
- `@solana/kit` (Not used, can remove)
- `@solana-program/system` (Not used)
- `@solana-program/token` (Not used)

### 2. Files to Delete/Replace

#### Delete Entirely:
None (you'll modify existing files)

#### Modify These Files:
- `app/providers.tsx` - Replace Privy config
- `components/payments/MoonPayWidget.tsx` - Change currency code
- `app/api/webhooks/privy/route.ts` - Update wallet address format
- `app/api/user/sync-wallet/route.ts` - Stellar wallet sync logic

### 3. Environment Variables to Remove/Change

**Remove:**
```env
NEXT_PUBLIC_BASE_RPC_URL=...  # Not needed for Stellar
```

**Keep (but verify Privy supports Stellar):**
```env
NEXT_PUBLIC_PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
```

---

## What to Add

### 1. New Dependencies

```bash
npm install @stellar/stellar-sdk
npm install @stellar/typescript-wallet-sdk  # Optional, for advanced wallet features
```

**Add to package.json:**
```json
{
  "dependencies": {
    "@stellar/stellar-sdk": "^13.0.0"
  }
}
```

### 2. New Environment Variables

```env
# Stellar Network Configuration
NEXT_PUBLIC_STELLAR_NETWORK=testnet  # or 'mainnet' for production
NEXT_PUBLIC_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org  # If using Soroban

# Yellow Card Integration (for off-ramp)
YELLOW_CARD_API_KEY=...
YELLOW_CARD_SECRET=...
YELLOW_CARD_WEBHOOK_SECRET=...

# USDC Issuer on Stellar (Circle's official USDC)
NEXT_PUBLIC_USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
NEXT_PUBLIC_USDC_CODE=USDC
```

### 3. New API Endpoints to Create

```
app/api/webhooks/yellowcard/route.ts    # Handle Yellow Card webhooks
app/api/stellar/balance/route.ts         # Get wallet balance (USDC + XLM)
app/api/stellar/send-payment/route.ts    # Send USDC payments
app/api/stellar/estimate-fee/route.ts    # Estimate transaction fees
```

### 4. New Utility Files

```
lib/stellar.ts           # Stellar SDK initialization & utilities
lib/yellowcard.ts        # Yellow Card API client (off-ramp)
lib/stellar-wallet.ts    # Wallet management utilities
```

---

## Wallet Provider Options

### Option 1: Continue Using Privy ✅ **RECOMMENDED**

**Pros:**
- Minimal code changes
- Privy **already supports Stellar** (confirmed in research)
- Same social login experience
- Embedded wallet UX remains the same

**Cons:**
- Still depends on third-party service
- Need to verify Privy's Stellar support level

**Implementation:**
Update `app/providers.tsx`:
```typescript
import { PrivyProvider } from '@privy-io/react-auth'
import { stellar } from '@privy-io/chains'  // If Privy exports Stellar chain config

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ['email'],
        appearance: {
          theme: 'light',
          accentColor: '#111827',
        },
        embeddedWallets: {
          stellar: {  // Changed from 'ethereum'
            createOnLogin: 'all-users',
          },
        },
        defaultChain: stellar,  // Replace 'base' with Stellar
        supportedChains: [stellar],
      }}
    >
      {children}
    </PrivyProvider>
  )
}
```

### Option 2: Use Turnkey or DFNS

**Pros:**
- Non-custodial with MPC security
- Full control over infrastructure
- Supports Stellar natively

**Cons:**
- More complex integration
- Higher cost (enterprise pricing)
- Requires more code changes

**Implementation:**
Would require replacing entire auth system.

### Option 3: Build Custom with Stellar SDK

**Pros:**
- Full control
- No vendor lock-in
- Lowest ongoing costs

**Cons:**
- Significantly more development time
- Need to handle key management security
- Responsible for wallet backup/recovery

---

## XLM Reserve Requirements

### Understanding XLM Reserves

Every Stellar account requires a **minimum balance of XLM** to exist on the network:

| Requirement | XLM Amount | Cost (at $0.50/XLM) |
|-------------|-----------|-------------------|
| **Base Account** | 1 XLM (2 base reserves) | ~$0.50 |
| **Each Trustline** (e.g., USDC) | +0.5 XLM | ~$0.25 |
| **Each Offer/Data Entry** | +0.5 XLM | ~$0.25 |

**For LancePay Use Case:**
- Basic account: 1 XLM
- + USDC trustline: +0.5 XLM
- **Total required: ~1.5 XLM per wallet** (~$0.75 at current prices)

### Handling XLM in Wallets

**YES, wallet providers CAN hold XLM:**
- Privy, Turnkey, DFNS all support holding native XLM
- Each wallet will need 1.5 XLM to function with USDC
- This is a **reserve**, not a fee (XLM is recoverable if account closes)

### Strategies for Managing XLM

#### Strategy 1: Fund Wallets Automatically ✅ **RECOMMENDED**
When a new user creates a wallet, automatically fund it with 2 XLM:

```typescript
// In webhook handler after wallet creation
async function fundNewWallet(stellarAddress: string) {
  const server = new StellarSdk.Horizon.Server(HORIZON_URL)
  const sourceKeypair = StellarSdk.Keypair.fromSecret(FUNDING_WALLET_SECRET)

  const account = await server.loadAccount(sourceKeypair.publicKey())

  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET
  })
    .addOperation(StellarSdk.Operation.createAccount({
      destination: stellarAddress,
      startingBalance: '2.0'  // 2 XLM to cover reserves + buffer
    }))
    .setTimeout(30)
    .build()

  transaction.sign(sourceKeypair)
  await server.submitTransaction(transaction)
}
```

**Cost:** ~$1.00 per user (one-time)

#### Strategy 2: User Funds Own Wallet
Require users to deposit XLM themselves (bad UX, not recommended).

#### Strategy 3: Sponsor Reserves (Advanced)
Use Stellar's [sponsored reserves feature](https://developers.stellar.org/docs/encyclopedia/sponsored-reserves) to pay reserves on behalf of users.

---

## Technical Implementation

### 1. Create Stellar Utility Library

**File:** `lib/stellar.ts`

```typescript
import * as StellarSdk from '@stellar/stellar-sdk'

// Network configuration
export const STELLAR_NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
  ? StellarSdk.Networks.PUBLIC
  : StellarSdk.Networks.TESTNET

export const HORIZON_URL = process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ||
  'https://horizon-testnet.stellar.org'

// Initialize Horizon server
export const server = new StellarSdk.Horizon.Server(HORIZON_URL)

// USDC asset on Stellar (Circle's official USDC)
export const USDC_ASSET = new StellarSdk.Asset(
  'USDC',
  process.env.NEXT_PUBLIC_USDC_ISSUER!
)

// Get account balance
export async function getAccountBalance(publicKey: string) {
  try {
    const account = await server.loadAccount(publicKey)
    const balances = account.balances

    const xlmBalance = balances.find(b => b.asset_type === 'native')
    const usdcBalance = balances.find(
      b => b.asset_type !== 'native' &&
      (b as any).asset_code === 'USDC' &&
      (b as any).asset_issuer === process.env.NEXT_PUBLIC_USDC_ISSUER
    )

    return {
      xlm: xlmBalance ? parseFloat(xlmBalance.balance) : 0,
      usdc: usdcBalance ? parseFloat(usdcBalance.balance) : 0,
    }
  } catch (error) {
    console.error('Error fetching balance:', error)
    return { xlm: 0, usdc: 0 }
  }
}

// Add USDC trustline to account
export async function addUSDCTrustline(publicKey: string, secretKey: string) {
  const account = await server.loadAccount(publicKey)
  const keypair = StellarSdk.Keypair.fromSecret(secretKey)

  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: STELLAR_NETWORK
  })
    .addOperation(StellarSdk.Operation.changeTrust({
      asset: USDC_ASSET,
    }))
    .setTimeout(30)
    .build()

  transaction.sign(keypair)
  return await server.submitTransaction(transaction)
}

// Send USDC payment
export async function sendUSDCPayment(
  fromPublicKey: string,
  fromSecretKey: string,
  toPublicKey: string,
  amount: string
) {
  const account = await server.loadAccount(fromPublicKey)
  const keypair = StellarSdk.Keypair.fromSecret(fromSecretKey)

  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: STELLAR_NETWORK
  })
    .addOperation(StellarSdk.Operation.payment({
      destination: toPublicKey,
      asset: USDC_ASSET,
      amount: amount,
    }))
    .setTimeout(30)
    .build()

  transaction.sign(keypair)
  return await server.submitTransaction(transaction)
}

// Validate Stellar address
export function isValidStellarAddress(address: string): boolean {
  return StellarSdk.StrKey.isValidEd25519PublicKey(address)
}
```

### 2. Update Balance API

**File:** `app/api/user/balance/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { getAccountBalance } from '@/lib/stellar'

export async function GET(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { privyId: claims.userId },
      include: { wallet: true }
    })

    if (!user || !user.wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    // Get balance from Stellar network
    const { xlm, usdc } = await getAccountBalance(user.wallet.address)

    return NextResponse.json({
      usd: usdc,  // USDC balance represents USD
      xlm: xlm,   // XLM balance for reserves
      address: user.wallet.address
    })
  } catch (error) {
    console.error('Balance fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 })
  }
}
```

### 3. Update MoonPay Widget

**File:** `components/payments/MoonPayWidget.tsx`

```typescript
'use client'

import { useCallback } from 'react'

interface MoonPayWidgetProps {
  walletAddress: string
  amount: number
  currencyCode?: string
  invoiceId?: string
}

export function useMoonPayWidget() {
  const openWidget = useCallback(async ({
    walletAddress,
    amount,
    currencyCode = 'usdc_stellar',  // Changed from 'usdc_base'
    invoiceId
  }: MoonPayWidgetProps) => {
    const { loadMoonPay } = await import('@moonpay/moonpay-js')

    const moonPay = await loadMoonPay()
    if (!moonPay) throw new Error('Failed to load MoonPay')

    const sdk = moonPay({
      flow: 'buy',
      environment: 'sandbox',
      variant: 'overlay',
      params: {
        apiKey: process.env.NEXT_PUBLIC_MOONPAY_API_KEY!,
        theme: 'dark',
        baseCurrencyCode: 'usd',
        baseCurrencyAmount: String(amount),
        defaultCurrencyCode: currencyCode,  // 'usdc_stellar'
        walletAddress: walletAddress,  // Stellar address (starts with G...)
        externalTransactionId: invoiceId,
      }
    })

    if (sdk) sdk.show()
    return sdk
  }, [])

  return { openWidget }
}
```

**Note:** Verify MoonPay supports `usdc_stellar` - you may need to contact MoonPay or use Yellow Card instead.

### 4. Create Yellow Card Off-Ramp Integration

**File:** `lib/yellowcard.ts`

```typescript
// Yellow Card API client for off-ramping USDC → NGN
// Documentation: https://docs.yellowcard.io (check official docs)

interface WithdrawalRequest {
  amount: number  // USDC amount
  bankAccountId: string
  userId: string
}

export async function initiateWithdrawal(request: WithdrawalRequest) {
  // This is a placeholder - implement based on Yellow Card's actual API
  const response = await fetch('https://api.yellowcard.io/v1/withdrawals', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.YELLOW_CARD_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      currency: 'USDC',
      network: 'stellar',
      amount: request.amount,
      destination: {
        type: 'bank_account',
        account_id: request.bankAccountId,
      },
      user_id: request.userId,
    }),
  })

  return await response.json()
}
```

---

## Database Schema Changes

### Current Schema
```prisma
model Wallet {
  id        String   @id @default(cuid())
  userId    String   @unique
  address   String   @unique  // Currently Ethereum address (0x...)
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
}
```

### No Changes Needed! ✅

Stellar addresses are also strings (format: `G...` instead of `0x...`), so your current schema works as-is.

**Just ensure:**
- Wallet addresses are validated as Stellar addresses (not Ethereum)
- Update any regex/validation that checks for `0x` prefix

---

## API Changes Required

### Minimal Changes Needed

| Endpoint | Change Required | Complexity |
|----------|----------------|------------|
| `/api/user/balance` | Update to fetch from Stellar Horizon API | Low |
| `/api/user/sync-wallet` | Same logic, just Stellar address format | Low |
| `/api/webhooks/privy` | Same logic if using Privy for Stellar | Low |
| `/api/withdrawals/create` | Integrate Yellow Card API | Medium |
| `/api/webhooks/moonpay` | No change needed | None |
| `/api/exchange-rate` | May need to add XLM/USD rate | Low |

### New Endpoints to Add

1. **`/api/stellar/trustline/add`** - Add USDC trustline to new wallets
2. **`/api/webhooks/yellowcard`** - Handle withdrawal confirmations
3. **`/api/stellar/fund-wallet`** - Fund new wallet with XLM (internal)

---

## Frontend Changes

### Minimal UI Changes

1. **Wallet Address Display**
   - Change from `0x...` to `G...` format
   - Update copy/paste validation

2. **Balance Display**
   - Show both USDC and XLM balances
   - Add tooltip explaining XLM reserve

3. **Payment Flow**
   - Update MoonPay currency code
   - Same UX otherwise

### Example Balance Card Update

```typescript
// components/dashboard/balance-card.tsx

// Add XLM balance display
<div className="text-sm text-gray-500 mt-2">
  Reserve: {xlmBalance.toFixed(2)} XLM
</div>
```

---

## Migration Checklist

### Phase 1: Setup & Dependencies
- [ ] Install `@stellar/stellar-sdk`
- [ ] Remove unused dependencies (viem, solana packages)
- [ ] Add Stellar environment variables
- [ ] Create `lib/stellar.ts` utility file

### Phase 2: Wallet Provider
- [ ] Verify Privy supports Stellar (contact support if needed)
- [ ] Update `app/providers.tsx` with Stellar chain config
- [ ] Test wallet creation on testnet
- [ ] Implement XLM funding for new wallets

### Phase 3: Core Functionality
- [ ] Update balance API to fetch from Stellar
- [ ] Update MoonPay widget currency code
- [ ] Add USDC trustline logic for new wallets
- [ ] Test payment flow end-to-end on testnet

### Phase 4: Off-Ramp Integration
- [ ] Sign up for Yellow Card API access
- [ ] Implement Yellow Card withdrawal API
- [ ] Create Yellow Card webhook handler
- [ ] Test withdrawal flow NGN → Nigerian bank

### Phase 5: Testing & Migration
- [ ] Full testnet testing
- [ ] Update documentation
- [ ] Create migration script for existing users (if any)
- [ ] Deploy to production
- [ ] Monitor first transactions closely

---

## Important Notes

### Testnet vs Mainnet

**Stellar Testnet:**
- Horizon: `https://horizon-testnet.stellar.org`
- Network passphrase: `Test SDF Network ; September 2015`
- Free XLM from friendbot: `https://friendbot.stellar.org`

**Stellar Mainnet:**
- Horizon: `https://horizon.stellar.org`
- Network passphrase: `Public Global Stellar Network ; September 2015`

### Transaction Costs

- Base fee: **0.00001 XLM** (~$0.000005)
- Typical transaction: **0.0001 XLM** (~$0.00005)
- Much cheaper than Base network

### Address Format

- Stellar addresses start with `G` (e.g., `GDJK...`)
- 56 characters long
- Base32 encoded

---

## Additional Resources

- [Stellar Documentation](https://developers.stellar.org/)
- [Stellar SDK GitHub](https://github.com/stellar/js-stellar-sdk)
- [Yellow Card for Developers](https://yellowcard.io/)
- [Stellar Wallet SDK](https://stellar.org/products-and-tools/wallet-sdk)
- [Custody Models Guide](https://stellarplaybook.com/wallets/custody/)

---

## Questions & Support

If you encounter issues during migration:

1. Check Stellar Discord: https://discord.gg/stellar
2. Stellar Stack Exchange: https://stellar.stackexchange.com/
3. GitHub Discussions: https://github.com/stellar/js-stellar-sdk/discussions

---

**Last Updated:** 2026-01-19
