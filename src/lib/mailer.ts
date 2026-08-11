import { Resend } from "resend";

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  baseDelayMs: number,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        const delay = baseDelayMs * 2 ** attempt;
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

let cachedClient: Resend | null = null;

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!cachedClient) {
    cachedClient = new Resend(apiKey);
  }
  return cachedClient;
}

function parseRecipients(): string[] {
  const raw = process.env.EMAIL_RECIPIENTS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function getFrom(): string | null {
  return process.env.EMAIL_FROM ?? null;
}

function formatMonth(monthKey: string): string {
  // monthKey is YYYY-MM
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthIndex) ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    return monthKey;
  }
  const date = new Date(Date.UTC(year, monthIndex, 1));
  return date.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

type SendArgs = {
  subject: string;
  text: string;
  recipients: string[];
  attachments?: { filename: string; content: Buffer }[];
};

async function send(args: SendArgs): Promise<void> {
  const client = getClient();
  if (!client) {
    console.warn("[mailer] RESEND_API_KEY not set — skipping email send.");
    return;
  }
  if (args.recipients.length === 0) {
    console.warn("[mailer] No recipients configured — skipping email send.");
    return;
  }
  const from = getFrom();
  if (!from) {
    console.warn("[mailer] EMAIL_FROM not set — skipping email send.");
    return;
  }

  await withRetry(
    () => client.emails.send({
      from,
      to: args.recipients,
      subject: args.subject,
      text: args.text,
      attachments: args.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    }),
    3,
    1000,
  );
}

export async function sendDashboardEmail(opts: {
  month: string;
  pdfBuffer: Buffer;
  recipients?: string[];
}): Promise<void> {
  const recipients = opts.recipients ?? parseRecipients();
  const prettyMonth = formatMonth(opts.month);
  await send({
    subject: `Actual Dashboard — ${prettyMonth}`,
    text: `Attached is the Actual Dashboard report for ${prettyMonth}.`,
    recipients,
    attachments: [
      {
        filename: `dashboard-${opts.month}.pdf`,
        content: opts.pdfBuffer,
      },
    ],
  });
}

export async function sendSyncFailureAlert(error: Error): Promise<void> {
  const recipients = parseRecipients();
  const body = [
    "The Actual Dashboard sync job failed.",
    "",
    `Error: ${error.message}`,
    "",
    "Stack trace:",
    error.stack ?? "(no stack trace available)",
  ].join("\n");
  await send({
    subject: "[Actual Dashboard] Sync failed",
    text: body,
    recipients,
  });
}

export async function sendSyncRecoveryAlert(): Promise<void> {
  const recipients = parseRecipients();
  await send({
    subject: "[Actual Dashboard] Sync recovered",
    text: "The Actual Dashboard sync job succeeded after a prior failure. All clear.",
    recipients,
  });
}
