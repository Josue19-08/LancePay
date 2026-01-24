import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params
  const invoice = await prisma.invoice.findUnique({
    where: { invoiceNumber: invoiceId },
    include: { user: { select: { name: true, wallet: { select: { address: true } } } } },
  })

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  return NextResponse.json({
    invoiceNumber: invoice.invoiceNumber,
    freelancerName: invoice.user.name || 'Freelancer',
    description: invoice.description,
    amount: Number(invoice.amount),
    status: invoice.status,
    dueDate: invoice.dueDate,
    walletAddress: invoice.user.wallet?.address,
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params
  const invoice = await prisma.invoice.findUnique({ where: { invoiceNumber: invoiceId } })

  if (!invoice || invoice.status !== 'pending') {
    return NextResponse.json({ error: 'Invalid invoice' }, { status: 400 })
  }

  const updatedInvoice = await prisma.invoice.update({ 
    where: { id: invoice.id }, 
    data: { status: 'paid', paidAt: new Date() },
    include: { user: true }
  })

  await prisma.transaction.create({
    data: { userId: invoice.userId, type: 'incoming', status: 'completed', amount: invoice.amount, currency: invoice.currency, invoiceId: invoice.id, completedAt: new Date() },
  })

  // Process auto-swap
  const { processAutoSwap } = await import('@/lib/auto-swap')
  await processAutoSwap(
    updatedInvoice.userId,
    Number(updatedInvoice.amount),
    updatedInvoice.user.email,
    updatedInvoice.user.name || undefined
  )

  return NextResponse.json({ success: true })
}
