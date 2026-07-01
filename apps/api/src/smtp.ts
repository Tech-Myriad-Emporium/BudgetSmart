import { connect } from "cloudflare:sockets";
import type { Env } from "./types.js";

// Minimal SMTP-over-TLS client for Gmail (implicit TLS on :465), so the Worker
// can send verification emails using a Gmail App Password. Speaks just enough
// SMTP: greeting → EHLO → AUTH LOGIN → MAIL/RCPT/DATA → QUIT.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface Reply {
  code: number;
  raw: string;
}

async function readReply(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Reply> {
  let buf = "";
  // A complete reply ends with a line "NNN <text>\r\n" (space, not hyphen, after the code).
  for (let i = 0; i < 50; i++) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\r\n").filter((l) => l.length > 0);
    const last = lines[lines.length - 1];
    if (last && /^\d{3} /.test(last)) {
      return { code: parseInt(last.slice(0, 3), 10), raw: buf };
    }
  }
  return { code: 0, raw: buf };
}

function buildMessage(from: string, to: string, subject: string, text: string, html: string): string {
  const boundary = "bs_" + crypto.randomUUID();
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@budgetsmarttme.com>`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const body = [
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    text,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    html,
    `--${boundary}--`,
  ];
  return headers.join("\r\n") + "\r\n\r\n" + body.join("\r\n");
}

/** Dot-stuff per RFC 5321: lines beginning with '.' get an extra leading '.'. */
const dotStuff = (msg: string) =>
  msg
    .split("\r\n")
    .map((l) => (l.startsWith(".") ? "." + l : l))
    .join("\r\n");

export async function sendMailGmail(
  env: Env,
  msg: { to: string; subject: string; html: string; text: string },
): Promise<void> {
  const user = env.GMAIL_USER!;
  const pass = (env.GMAIL_APP_PASSWORD ?? "").replace(/\s+/g, "");
  const from = env.EMAIL_FROM || user;

  const socket = connect("smtp.gmail.com:465", { secureTransport: "on", allowHalfOpen: false });
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const write = (s: string) => writer.write(encoder.encode(s));
  const expect = async (want: number, label: string) => {
    const r = await readReply(reader);
    if (r.code !== want) throw new Error(`SMTP ${label}: expected ${want}, got ${r.code} — ${r.raw.trim().slice(0, 120)}`);
    return r;
  };

  try {
    await expect(220, "greeting");
    await write(`EHLO budgetsmarttme.com\r\n`);
    await expect(250, "EHLO");
    await write(`AUTH LOGIN\r\n`);
    await expect(334, "AUTH");
    await write(btoa(user) + "\r\n");
    await expect(334, "username");
    await write(btoa(pass) + "\r\n");
    await expect(235, "password"); // auth accepted
    await write(`MAIL FROM:<${user}>\r\n`);
    await expect(250, "MAIL FROM");
    await write(`RCPT TO:<${msg.to}>\r\n`);
    await expect(250, "RCPT TO");
    await write(`DATA\r\n`);
    await expect(354, "DATA");
    await write(dotStuff(buildMessage(from, msg.to, msg.subject, msg.text, msg.html)) + "\r\n.\r\n");
    await expect(250, "message body");
    await write(`QUIT\r\n`);
  } finally {
    try { await writer.close(); } catch { /* ignore */ }
    try { await socket.close(); } catch { /* ignore */ }
  }
}
