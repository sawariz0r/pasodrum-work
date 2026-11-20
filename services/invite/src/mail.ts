export type Mail = { to: string; subject: string; html: string; text: string };
export type MailConfig = { from: string; resendKey?: string; mailpitUrl: string };
export type SendMail = (mail: Mail) => Promise<void>;

export function parseAddress(s: string): { name?: string; email: string } {
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || undefined, email: m[2]! } : { email: s.trim() };
}

// D-26: Resend in production, Mailpit's HTTP send API locally.
export function mailer(cfg: MailConfig): SendMail {
  return async (mail) => {
    const res = cfg.resendKey
      ? await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: cfg.from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
        })
      : await fetch(`${cfg.mailpitUrl}/api/v1/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            From: { Email: parseAddress(cfg.from).email, Name: parseAddress(cfg.from).name ?? '' },
            To: [{ Email: mail.to }],
            Subject: mail.subject,
            HTML: mail.html,
            Text: mail.text,
          }),
        });
    if (!res.ok) throw new Error(`mail ${cfg.resendKey ? 'resend' : 'mailpit'} → ${res.status}`);
  };
}
