import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// Centralized sender identity (server-only).
// Must be a verified sender in Resend (domain or single sender).
const RESEND_FROM = process.env.RESEND_FROM || 'LancePay <onboarding@resend.dev>'

interface PaymentEmailParams {
  to: string
  freelancerName: string
  clientName: string
  invoiceNumber: string
  amount: number
  currency: string
}

export async function sendPaymentReceivedEmail(params: PaymentEmailParams) {
  const { to, freelancerName, clientName, invoiceNumber, amount, currency } = params

  try {
    const { error } = await resend.emails.send({
      from: RESEND_FROM,
      to: [to],
      subject: `Payment Received - ${invoiceNumber}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #111;">Hey ${freelancerName}!</h2>
          <p>You received a payment for invoice <strong>${invoiceNumber}</strong>.</p>
          <div style="background:#ECFDF5;border:1px solid #A7F3D0;color:#065F46;padding:24px;border-radius:12px;text-align:center;margin:20px 0;">
            <div style="font-size: 32px; font-weight: bold;">$${amount.toFixed(2)}</div>
            <div>${currency}</div>
          </div>
          <p style="color: #666;">From: ${clientName}</p>
          <p style="color: #666; font-size: 12px;">LancePay - Get paid globally, withdraw locally</p>
        </div>
      `,
    })

    if (error) console.error('Email error:', error)
    return { success: !error }
  } catch (error) {
    console.error('Email send failed:', error)
    return { success: false }
  }
}

interface AdminAlertParams {
  subject: string
  message: string
  severity?: 'warning' | 'critical'
  context?: Record<string, unknown>
  actionRequired?: string
}

export async function sendAdminAlertEmail(params: AdminAlertParams) {
  const to = process.env.ADMIN_ALERT_EMAIL
  if (!to) {
    console.warn('ADMIN_ALERT_EMAIL not configured; admin alert email skipped', {
      subject: params.subject,
    })
    return { success: false, skipped: true as const }
  }

  const severity = params.severity || 'warning'
  const severityLabel = severity === 'critical' ? 'CRITICAL' : 'WARNING'

  const severityBg = severity === 'critical' ? '#FEF2F2' : '#FFFBEB'
  const severityBorder = severity === 'critical' ? '#FCA5A5' : '#FCD34D'
  const severityText = severity === 'critical' ? '#991B1B' : '#92400E'

  try {
    const contextHtml = params.context
      ? `
        <div style="margin-top:16px;">
          <strong style="color:#111;">Context:</strong>
          <pre style="background:#f6f8fa;padding:12px;border-radius:8px;overflow:auto;font-size:12px;">${escapeHtml(
            JSON.stringify(params.context, null, 2)
          )}</pre>
        </div>
      `
      : ''

    const actionHtml = params.actionRequired
      ? `
        <div style="background:${severityBg};border-left:4px solid ${severityBorder};padding:12px;margin:16px 0;border-radius:4px;">
          <strong style="color:${severityText};">Action Required:</strong>
          <p style="color:${severityText};margin:4px 0 0 0;">${escapeHtml(params.actionRequired)}</p>
        </div>
      `
      : ''

    const { error } = await resend.emails.send({
      from: RESEND_FROM,
      to: [to],
      subject: `[LancePay ${severityLabel}] ${params.subject}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 680px; margin: 0 auto; padding: 24px;">
          <div style="margin-bottom:14px;">
            <span style="display:inline-block;background:${severityBg};border:1px solid ${severityBorder};color:${severityText};padding:6px 12px;border-radius:8px;font-size:12px;line-height:1;font-weight:700;letter-spacing:0.3px;">
              ${severityLabel}
            </span>
          </div>
          
          <h2 style="color:#111;margin:0 0 12px 0;">${escapeHtml(params.subject)}</h2>
          <p style="color:#333;line-height:1.5;">${escapeHtml(params.message)}</p>
          ${actionHtml}
          ${contextHtml}
          <p style="color:#666;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px;">
            Automated alert from LancePay operations
          </p>
        </div>
      `,
    })

    if (error) {
      console.error('Admin alert email failed', { error })
      return { success: false }
    }
    return { success: true }
  } catch (error) {
    console.error('Admin alert email threw', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return { success: false }
  }
}

/**
 * Basic HTML entity escaping for dynamic fields rendered into the email template.
 * Prevents unintended HTML interpretation and reduces injection risk in operational emails.
 */
function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
