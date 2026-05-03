import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { logger } from "./logger";

export interface InboxEmail {
  uid: number;
  from: { name: string; address: string };
  subject: string;
  date: string;
  snippet: string;
  seen: boolean;
}

export interface InboxEmailDetail extends InboxEmail {
  to: string;
  text: string;
  html: string | null;
}

export function isImapConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function makeClient() {
  return new ImapFlow({
    host: process.env.IMAP_HOST ?? "imap.gmail.com",
    port: Number(process.env.IMAP_PORT ?? "993"),
    secure: true,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
    logger: false,
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

/* ── In-memory cache ── */
let listCache: { emails: InboxEmail[]; at: number } | null = null;
const bodyCache = new Map<number, InboxEmailDetail>();
const CACHE_TTL = 3 * 60_000; // 3 minutes

export function invalidateInboxCache() {
  listCache = null;
}

/* ── Fetch inbox list ── */
export async function fetchInbox(limit = 40, forceRefresh = false): Promise<InboxEmail[]> {
  if (!forceRefresh && listCache && Date.now() - listCache.at < CACHE_TTL) {
    return listCache.emails;
  }

  const client = makeClient();
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    const emails: InboxEmail[] = [];

    try {
      const total = (client.mailbox as any)?.exists ?? 0;
      if (total === 0) { lock.release(); await client.logout(); return []; }

      const startSeq = Math.max(1, total - limit + 1);
      for await (const msg of client.fetch(`${startSeq}:*`, { envelope: true, flags: true })) {
        const f = msg.envelope.from?.[0];
        const subject = msg.envelope.subject ?? "(no subject)";
        const date = msg.envelope.date?.toISOString() ?? new Date().toISOString();
        emails.push({
          uid: msg.uid,
          from: { name: f?.name || f?.address || "Unknown", address: f?.address ?? "" },
          subject,
          date,
          snippet: subject.slice(0, 120),
          seen: msg.flags.has("\\Seen"),
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();
    const result = emails.reverse();
    listCache = { emails: result, at: Date.now() };
    logger.info({ count: result.length }, "IMAP inbox fetched");
    return result;
  } catch (err) {
    logger.error({ err }, "IMAP fetchInbox failed");
    try { await client.logout(); } catch {}
    throw err;
  }
}

/* ── Fetch full email body by UID ── */
export async function fetchEmailBody(uid: number): Promise<InboxEmailDetail> {
  const cached = bodyCache.get(uid);
  if (cached) return cached;

  const client = makeClient();
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    let detail: InboxEmailDetail | null = null;

    try {
      const dl = await client.download(String(uid), undefined, { uid: true });
      if (!dl) throw new Error("Message not found");

      const parsed = await simpleParser(dl.content);
      const f = parsed.from?.value?.[0];
      const toAddr = Array.isArray(parsed.to)
        ? parsed.to[0]?.value?.[0]?.address ?? ""
        : (parsed.to as any)?.value?.[0]?.address ?? "";

      detail = {
        uid,
        from: { name: f?.name || f?.address || "Unknown", address: f?.address ?? "" },
        to: toAddr,
        subject: parsed.subject ?? "(no subject)",
        date: parsed.date?.toISOString() ?? new Date().toISOString(),
        snippet: (parsed.text ?? "").slice(0, 120),
        seen: true,
        text: parsed.text ?? "",
        html: typeof parsed.html === "string" ? parsed.html : null,
      };
    } finally {
      lock.release();
    }

    await client.logout();
    if (detail) {
      bodyCache.set(uid, detail);
      if (listCache) {
        const item = listCache.emails.find(e => e.uid === uid);
        if (item) item.seen = true;
      }
    }
    return detail!;
  } catch (err) {
    logger.error({ err, uid }, "IMAP fetchEmailBody failed");
    try { await client.logout(); } catch {}
    throw err;
  }
}
