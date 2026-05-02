import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

function getGmailClient() {
  const gmailConnectorHostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const replIdentity = process.env.REPL_IDENTITY;
  if (!gmailConnectorHostname || !replIdentity) return null;
  return { hostname: gmailConnectorHostname, identity: replIdentity };
}

async function callGmailAPI(path: string, method = "GET", body?: unknown) {
  const client = getGmailClient();
  if (!client) throw new Error("Gmail not connected");

  const connectionId = process.env.GMAIL_CONNECTION_ID;
  if (!connectionId) throw new Error("GMAIL_CONNECTION_ID not set");

  const tokenRes = await fetch(
    `https://${client.hostname}/api/v2/connection/${connectionId}/token`,
    {
      headers: {
        Authorization: `Bearer ${client.identity}`,
        "Content-Type": "application/json",
      },
    }
  );
  if (!tokenRes.ok) throw new Error("Failed to get Gmail token");
  const { access_token } = await tokenRes.json();

  const url = `https://gmail.googleapis.com/gmail/v1/users/me${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API error: ${err}`);
  }
  return res.json();
}

function makeRFC2822(to: string, subject: string, body: string): string {
  const msg = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `MIME-Version: 1.0`,
    ``,
    body,
  ].join("\r\n");
  return Buffer.from(msg).toString("base64url");
}

router.get("/gmail/inbox", async (req, res): Promise<void> => {
  if (!process.env.GMAIL_CONNECTION_ID) {
    res.status(503).json({ error: "Gmail not connected. Please connect your Gmail account first." });
    return;
  }
  try {
    const maxResults = Number(req.query.maxResults) || 10;
    const labelIds = (req.query.labelIds as string) || "INBOX";

    const listRes = await callGmailAPI(
      `/messages?maxResults=${maxResults}&labelIds=${labelIds}`
    );
    const messageIds: string[] = (listRes.messages || []).map((m: { id: string }) => m.id);

    const messages = await Promise.all(
      messageIds.map(async (id) => {
        const msg = await callGmailAPI(`/messages/${id}?format=metadata&metadataHeaders=Subject,From,Date`);
        const headers = (msg.payload?.headers || []) as Array<{ name: string; value: string }>;
        const get = (name: string) => headers.find((h) => h.name === name)?.value ?? "";
        return {
          id: msg.id,
          threadId: msg.threadId,
          snippet: msg.snippet ?? "",
          subject: get("Subject"),
          from: get("From"),
          date: get("Date"),
          isUnread: (msg.labelIds || []).includes("UNREAD"),
        };
      })
    );

    res.json({ messages });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/gmail/messages/:id", async (req, res): Promise<void> => {
  if (!process.env.GMAIL_CONNECTION_ID) {
    res.status(503).json({ error: "Gmail not connected." });
    return;
  }
  try {
    const msg = await callGmailAPI(`/messages/${req.params.id}?format=full`);
    const headers = (msg.payload?.headers || []) as Array<{ name: string; value: string }>;
    const get = (name: string) => headers.find((h) => h.name === name)?.value ?? "";

    let body = "";
    const parts = msg.payload?.parts || [];
    for (const part of parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        body = Buffer.from(part.body.data, "base64").toString("utf-8");
        break;
      }
    }
    if (!body && msg.payload?.body?.data) {
      body = Buffer.from(msg.payload.body.data, "base64").toString("utf-8");
    }

    res.json({
      id: msg.id,
      threadId: msg.threadId,
      subject: get("Subject"),
      from: get("From"),
      to: get("To"),
      date: get("Date"),
      body,
      snippet: msg.snippet,
      isUnread: (msg.labelIds || []).includes("UNREAD"),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/gmail/send", async (req, res): Promise<void> => {
  if (!process.env.GMAIL_CONNECTION_ID) {
    res.status(503).json({ error: "Gmail not connected." });
    return;
  }
  const { to, subject, body } = req.body;
  if (!to || !subject || !body) {
    res.status(400).json({ error: "to, subject, and body are required" });
    return;
  }
  try {
    const raw = makeRFC2822(to, subject, body);
    await callGmailAPI("/messages/send", "POST", { raw });
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/gmail/reply/:messageId", async (req, res): Promise<void> => {
  if (!process.env.GMAIL_CONNECTION_ID) {
    res.status(503).json({ error: "Gmail not connected." });
    return;
  }
  try {
    const msg = await callGmailAPI(`/messages/${req.params.messageId}?format=full`);
    const headers = (msg.payload?.headers || []) as Array<{ name: string; value: string }>;
    const get = (name: string) => headers.find((h) => h.name === name)?.value ?? "";

    let originalBody = "";
    const parts = msg.payload?.parts || [];
    for (const part of parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        originalBody = Buffer.from(part.body.data, "base64").toString("utf-8");
        break;
      }
    }
    if (!originalBody && msg.payload?.body?.data) {
      originalBody = Buffer.from(msg.payload.body.data, "base64").toString("utf-8");
    }

    const subject = get("Subject");
    const from = get("From");
    const tone = req.body.tone || "professional";
    const instructions = req.body.instructions || "";

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 2048,
      messages: [
        {
          role: "system",
          content: `You are an expert email writer. Write a reply to the email below.
Tone: ${tone}.${instructions ? ` Additional instructions: ${instructions}` : ""}
Keep it concise and professional. Do not include a subject line — just the email body text.`,
        },
        {
          role: "user",
          content: `From: ${from}\nSubject: ${subject}\n\n${originalBody}`,
        },
      ],
    });

    const draftBody = aiResponse.choices[0]?.message?.content ?? "";

    if (req.body.autoSend) {
      const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
      const raw = makeRFC2822(from, replySubject, draftBody);
      await callGmailAPI("/messages/send", "POST", { raw, threadId: msg.threadId });
      res.json({ success: true, sent: true, body: draftBody });
    } else {
      res.json({ success: true, sent: false, body: draftBody, subject: `Re: ${subject}`, to: from });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/gmail/mark-read/:messageId", async (req, res): Promise<void> => {
  if (!process.env.GMAIL_CONNECTION_ID) {
    res.status(503).json({ error: "Gmail not connected." });
    return;
  }
  try {
    await callGmailAPI(`/messages/${req.params.messageId}/modify`, "POST", {
      removeLabelIds: ["UNREAD"],
    });
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
