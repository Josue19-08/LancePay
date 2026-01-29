import { prisma } from '@/lib/db'
import { getAccountBalance } from '@/lib/stellar'

/**
 * Lookup recipient by email or handle (@referralCode).
 * Returns user with wallet if found and has wallet.
 */
export async function lookupRecipient(identifier: string) {
  const trimmed = identifier.trim().toLowerCase()
  
  // Handle format: @handle
  if (trimmed.startsWith('@')) {
    const handle = trimmed.slice(1)
    const user = await prisma.user.findUnique({
      where: { referralCode: handle },
      include: { wallet: true },
    })
    if (!user || !user.wallet) return null
    return { user, walletAddress: user.wallet.address }
  }
  
  // Email lookup
  const user = await prisma.user.findUnique({
    where: { email: trimmed },
    include: { wallet: true },
  })
  if (!user || !user.wallet) return null
  return { user, walletAddress: user.wallet.address }
}

/**
 * Get sender's USDC balance from Stellar.
 * Returns balance as number (0 if error).
 */
export async function getSenderUSDCBalance(walletAddress: string): Promise<number> {
  try {
    const balances = await getAccountBalance(walletAddress)
    return parseFloat(balances.usdc) || 0
  } catch (error) {
    console.error('Error fetching sender balance:', error)
    return 0
  }
}

/**
 * Minimum XLM reserve for Stellar account operations (network fee buffer).
 * ~0.5 XLM should cover a few transactions.
 */
export const MIN_XLM_RESERVE = 0.5

/**
 * Check if sender has sufficient balance (amount + small buffer for fees).
 */
export async function hasSufficientBalance(
  walletAddress: string,
  amount: number,
): Promise<{ sufficient: boolean; currentBalance: number; required: number }> {
  const currentBalance = await getSenderUSDCBalance(walletAddress)
  // Small buffer for network fees (0.01 USDC should be enough)
  const required = amount + 0.01
  return {
    sufficient: currentBalance >= required,
    currentBalance,
    required,
  }
}
