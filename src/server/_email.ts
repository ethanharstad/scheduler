// ---------------------------------------------------------------------------
// Shared email delivery via Resend API (best-effort, never throws)
// ---------------------------------------------------------------------------

export interface SendEmailParams {
  to: string
  subject: string
  html: string
}

/** Best-effort email delivery via Resend. Logs errors, never throws. */
export async function sendEmail(
  env: Cloudflare.Env,
  params: SendEmailParams,
): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'noreply@sceneready.app',
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)')
    console.error(
      `[email] Resend API error ${res.status} for ${params.to}: ${body}`,
    )
    return false
  }
  return true
}
