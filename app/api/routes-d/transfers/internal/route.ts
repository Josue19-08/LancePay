import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyAuthToken } from '@/lib/auth'
import { sendUSDCPayment } from '@/lib/stellar'
import { lookupRecipient, hasSufficientBalance } from '@/app/api/routes-d/transfers/_shared'
import { sendTransferReceivedEmail } from '@/lib/email'
import { z } from 'zod'

const TransferInternalSchema = z.object({
  recipientIdentifier: z.string().min(1, 'recipientIdentifier is required'),
  amount: z.string().regex(/^\d+(\.\d{1,6})?$/, 'Invalid amount format'),
  memo: z.string().max(500).optional(),
})

/**
 * Get sender's Stellar secret key for signing.
 * 
 * TODO: Integrate with Privy API to get secret key or use delegated signing.
 * For now, this assumes secret keys are available server-side (e.g., via Privy API
 * or stored securely for platform wallets). In production, you may need to:
 * 1. Use Privy's server-side signing API (if available)
 * 2. Have users sign transactions client-side and submit signed tx
 * 3. Use a platform wallet for internal transfers
 */
async function getSenderSecretKey(privyId: string, walletAddress: string): Promise<string | null> {
  // Option 1: Check if Privy provides server-side secret key access
  // const privyClient = new PrivyClient(process.env.NEXT_PUBLIC_PRIVY_APP_ID!, process.env.PRIVY_APP_SECRET!)
  // const privyUser = await privyClient.getUser(privyId)
  // const wallet = privyUser.linkedAccounts.find((a: any) => a.address === walletAddress)
  // return wallet?.secretKey || null
  
  // Option 2: For platform-managed wallets, use env var
  // This would be for a platform wallet used for internal transfers
  // return process.env.PLATFORM_WALLET_SECRET_KEY || null
  
  // For now, return null to indicate signing integration needed
  // In production, implement one of the above options
  return null
}

export async function POST(request: NextRequest) {
  try {
    const authToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const claims = await verifyAuthToken(authToken)
    if (!claims) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const body = await request.json()
    const parsed = TransferInternalSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 })
    }

    const { recipientIdentifier, amount, memo } = parsed.data
    const amountNum = parseFloat(amount)
    if (amountNum <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }

    // Get sender
    let sender = await prisma.user.findUnique({
      where: { privyId: claims.userId },
      include: { wallet: true },
    })
    if (!sender) {
      const email = (claims as any).email || `${claims.userId}@privy.local`
      sender = await prisma.user.create({
        data: { privyId: claims.userId, email },
        include: { wallet: true },
      })
    }

    if (!sender.wallet) {
      return NextResponse.json({ error: 'Sender wallet not found. Please set up your wallet first.' }, { status: 404 })
    }

    // Lookup recipient
    const recipientData = await lookupRecipient(recipientIdentifier)
    if (!recipientData) {
      return NextResponse.json(
        { error: 'Recipient not found or has no wallet. They must have a LancePay account with a linked wallet.' },
        { status: 404 },
      )
    }

    const { user: recipient, walletAddress: recipientAddress } = recipientData

    // Prevent self-transfer
    if (sender.id === recipient.id) {
      return NextResponse.json({ error: 'Cannot transfer to yourself' }, { status: 400 })
    }

    // Check balance
    const balanceCheck = await hasSufficientBalance(sender.wallet.address, amountNum)
    if (!balanceCheck.sufficient) {
      return NextResponse.json(
        {
          error: 'Insufficient balance',
          currentBalance: balanceCheck.currentBalance,
          required: balanceCheck.required,
        },
        { status: 400 },
      )
    }

    // Get sender secret key (requires Privy integration)
    const senderSecretKey = await getSenderSecretKey(claims.userId, sender.wallet.address)
    if (!senderSecretKey) {
      return NextResponse.json(
        {
          error: 'Transaction signing not available. Please integrate Privy signing API or use client-side signing.',
          // In production, remove this error and implement signing
        },
        { status: 501 },
      )
    }

    // Execute Stellar transaction
    let txHash: string
    try {
      txHash = await sendUSDCPayment(sender.wallet.address, senderSecretKey, recipientAddress, amount)
    } catch (error: any) {
      console.error('Stellar transfer error:', error)
      return NextResponse.json(
        {
          error: 'Transfer failed on Stellar network',
          details: error?.message || 'Unknown error',
        },
        { status: 500 },
      )
    }

    // Record transactions for both parties
    const now = new Date()
    await prisma.$transaction(async (tx) => {
      // Sender's "sent" transaction
      await tx.transaction.create({
        data: {
          userId: sender.id,
          type: 'transfer_out',
          status: 'completed',
          amount: amountNum,
          currency: 'USD',
          txHash,
          senderId: sender.id,
          recipientId: recipient.id,
          memo: memo || null,
          completedAt: now,
        },
      })

      // Recipient's "received" transaction
      await tx.transaction.create({
        data: {
          userId: recipient.id,
          type: 'transfer_in',
          status: 'completed',
          amount: amountNum,
          currency: 'USD',
          txHash,
          senderId: sender.id,
          recipientId: recipient.id,
          memo: memo || null,
          completedAt: now,
        },
      })
    })

    // Send notification email to recipient
    if (recipient.email) {
      await sendTransferReceivedEmail({
        to: recipient.email,
        senderName: sender.name || 'A LancePay user',
        amount: amountNum,
        memo: memo,
      })
    }

    return NextResponse.json({
      success: true,
      transactionHash: txHash,
      recipient: {
        email: recipient.email,
        name: recipient.name,
      },
      amount: amountNum,
      memo: memo || null,
    })
  } catch (error) {
    console.error('Internal transfer error:', error)
    return NextResponse.json({ error: 'Failed to process transfer' }, { status: 500 })
  }
}
