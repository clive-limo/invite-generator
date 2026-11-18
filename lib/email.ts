import "server-only";
import { Resend } from "resend";

interface Email {
  to: string;
  subject: string;
  /** Plain-text body; also used to build a minimal HTML version. */
  text: string;
  action?: { label: string; url: string };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function toHtml({ text, action }: Email): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(action.label)}</a></p>
       <p style="margin:0;color:#666;font-size:13px">Or paste this link into your browser:<br>${escapeHtml(action.url)}</p>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:480px">${paragraphs}${button}</div>`;
}

/**
 * Sends via Resend when RESEND_API_KEY is set. Without it (local dev) the email is
 * printed to the server log so verification and reset links can still be followed.
 */
export async function sendEmail(email: Email): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info(`\n[email] to=${email.to} subject="${email.subject}"\n${email.text}${email.action ? `\n${email.action.url}` : ""}\n`);
    return;
  }
  const from = process.env.EMAIL_FROM ?? "Chenah Invites <onboarding@resend.dev>";
  const text = email.action ? `${email.text}\n\n${email.action.label}: ${email.action.url}` : email.text;
  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: email.to,
    subject: email.subject,
    text,
    html: toHtml(email),
  });
  if (error) throw new Error(`Email to ${email.to} failed: ${error.message}`);
}
