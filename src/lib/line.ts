// lib/line.ts
// Sends a push message to your own LINE account via the Messaging API.

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
const LINE_USER_ID = process.env.LINE_USER_ID!; // your own userId, captured once via webhook

export async function pushLineMessage(text: string) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_USER_ID) {
    throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN or LINE_USER_ID env vars");
  }

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: LINE_USER_ID,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE push failed: ${res.status} ${body}`);
  }

  return res.json().catch(() => ({}));
}
