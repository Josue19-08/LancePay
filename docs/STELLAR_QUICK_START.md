# Stellar Migration Quick Start

**TL;DR:** Switch from Base to Stellar for better African market fit, lower costs, and direct Yellow Card integration.

---

## Quick Commands

### 1. Install Dependencies
```bash
npm install @stellar/stellar-sdk
npm uninstall viem @solana/kit @solana-program/system @solana-program/token
```

### 2. Add Environment Variables
```bash
# .env.local
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
NEXT_PUBLIC_USDC_CODE=USDC
YELLOW_CARD_API_KEY=your_key_here
```

---

## Key Files to Modify

### 1. `app/providers.tsx`
**Change:** Update Privy config from Base to Stellar

```diff
- import { base } from 'viem/chains'
+ // Privy should support Stellar - verify config

  embeddedWallets: {
-   ethereum: {
+   stellar: {
      createOnLogin: 'all-users',
    },
  },
- defaultChain: base,
- supportedChains: [base],
+ defaultChain: stellar,
+ supportedChains: [stellar],
```

### 2. `components/payments/MoonPayWidget.tsx`
**Change:** Update currency code

```diff
- currencyCode = 'usdc_base',
+ currencyCode = 'usdc_stellar',
```

### 3. `app/api/user/balance/route.ts`
**Change:** Fetch from Stellar Horizon instead of Base RPC

```typescript
import { getAccountBalance } from '@/lib/stellar'

const { xlm, usdc } = await getAccountBalance(user.wallet.address)
```

---

## New Files to Create

### 1. `lib/stellar.ts` (Core utilities)
```typescript
import * as StellarSdk from '@stellar/stellar-sdk'

export const server = new StellarSdk.Horizon.Server(
  process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL!
)

export const USDC_ASSET = new StellarSdk.Asset(
  'USDC',
  process.env.NEXT_PUBLIC_USDC_ISSUER!
)

export async function getAccountBalance(publicKey: string) {
  const account = await server.loadAccount(publicKey)
  // Parse balances for XLM and USDC
  // See full implementation in STELLAR_MIGRATION_GUIDE.md
}
```

### 2. `lib/yellowcard.ts` (Off-ramp)
```typescript
export async function initiateWithdrawal(amount: number, bankAccountId: string) {
  // Yellow Card API integration
  // See full implementation in STELLAR_MIGRATION_GUIDE.md
}
```

### 3. `app/api/webhooks/yellowcard/route.ts`
```typescript
export async function POST(request: NextRequest) {
  // Handle Yellow Card withdrawal confirmations
}
```

---

## XLM Reserve Requirements

**Every wallet needs XLM for reserves:**
- Base account: 1 XLM (~$0.50)
- USDC trustline: +0.5 XLM (~$0.25)
- **Total: 1.5 XLM per user** (~$0.75)

**Solution:** Auto-fund new wallets with 2 XLM when created.

```typescript
// In Privy webhook after wallet creation
const transaction = new StellarSdk.TransactionBuilder(account, {
  fee: StellarSdk.BASE_FEE,
  networkPassphrase: StellarSdk.Networks.TESTNET
})
  .addOperation(StellarSdk.Operation.createAccount({
    destination: newWalletAddress,
    startingBalance: '2.0'  // 2 XLM
  }))
  .build()
```

---

## Testing on Testnet

### 1. Get Free XLM from Friendbot
```bash
curl "https://friendbot.stellar.org?addr=YOUR_STELLAR_ADDRESS"
```

### 2. Check Balance
```bash
curl "https://horizon-testnet.stellar.org/accounts/YOUR_STELLAR_ADDRESS"
```

### 3. Test USDC Transfer
Use the Stellar Laboratory: https://laboratory.stellar.org/

---

## Wallet Provider: Privy

**Good news:** Privy DOES support Stellar (confirmed in research).

**Answer to your question: Yes, Privy can hold XLM.**

- Privy embedded wallets support Stellar network
- Each wallet can hold both XLM (native) and USDC (asset)
- XLM is automatically managed for reserves
- Users won't see XLM unless you show it in UI

---

## Yellow Card Integration

Yellow Card is Africa's largest licensed stablecoin on/off-ramp:
- Operates in 20+ African countries including Nigeria
- Direct USDC ↔ NGN conversion
- Much easier than building custom off-ramp

**Next Steps:**
1. Contact Yellow Card for API access
2. Read their docs: https://yellowcard.io/
3. Implement withdrawal endpoint using their API

---

## Address Format Differences

| Network | Address Format | Example |
|---------|---------------|---------|
| **Base (Current)** | 0x... (42 chars) | `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb` |
| **Stellar (New)** | G... (56 chars) | `GDJK5T2XZQBXPJY3NHHF3LLSQFXQC4K5PXZQB...` |

**No database changes needed** - both are strings.

---

## Migration Timeline Estimate

| Phase | Time | Tasks |
|-------|------|-------|
| **Setup** | 1-2 hours | Install deps, add env vars, create lib files |
| **Core Updates** | 2-3 hours | Update providers, balance API, MoonPay |
| **Testing** | 2-4 hours | Testnet testing, wallet creation, payments |
| **Yellow Card** | 4-8 hours | API integration, webhook handler, testing |
| **QA & Deploy** | 2-4 hours | Full testing, deploy to production |
| **Total** | **11-21 hours** | Depends on Yellow Card API complexity |

---

## Critical Questions to Answer

Before starting migration:

1. **Does Privy support Stellar?**
   - ✅ YES (confirmed in research)
   - Verify in Privy dashboard settings

2. **Does MoonPay support USDC on Stellar?**
   - ⚠️ Need to verify
   - Alternative: Use Yellow Card for on-ramp too

3. **Can we get Yellow Card API access?**
   - Contact: https://yellowcard.io/
   - May require business verification

4. **Do we have funds for XLM reserves?**
   - Need ~$0.75 per user upfront
   - Example: 1000 users = $750 in XLM

---

## Comparison: Base vs Stellar

| Feature | Base (Current) | Stellar (New) |
|---------|---------------|---------------|
| **Transaction Speed** | ~2 seconds | 3-5 seconds |
| **Transaction Cost** | $0.01-0.05 | <$0.01 |
| **African Integration** | ❌ Minimal | ✅ Extensive (Yellow Card, Onafriq) |
| **On/Off Ramps** | Limited | 475,000+ worldwide |
| **Setup Cost per User** | $0 | ~$0.75 (XLM reserve) |
| **Multi-Currency** | Requires bridges | ✅ Native path payments |
| **Code Complexity** | Current baseline | Similar/Simpler |

**Recommendation:** Switch to Stellar for Nigerian market.

---

## Need Help?

- **Full guide:** See `STELLAR_MIGRATION_GUIDE.md`
- **Stellar Discord:** https://discord.gg/stellar
- **Yellow Card support:** Contact through their website

---

**Created:** 2026-01-19
