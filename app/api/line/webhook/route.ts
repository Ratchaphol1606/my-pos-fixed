// app/api/line/webhook/route.ts
// ONE-TIME USE: deploy this, set the webhook URL in LINE Developers Console,
// add your bot as a friend / send it any message, then check your Vercel logs
// for your userId. Copy it into LINE_USER_ID env var. You can leave this route
// in place afterward — it's harmless, just logs events.

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();

  for (const event of body.events ?? []) {
    console.log("LINE event:", JSON.stringify(event, null, 2));
    if (event.source?.userId) {
      console.log("👉 Your LINE userId is:", event.source.userId);
    }
  }

  return NextResponse.json({ ok: true });
}
