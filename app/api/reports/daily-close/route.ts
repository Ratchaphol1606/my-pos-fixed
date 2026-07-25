// app/api/reports/daily-close/route.ts
// Triggered by Vercel Cron at closing time. Pulls today's sales summary
// from Supabase and pushes it to your LINE.
//
// ⚠️ ADJUST: table/column names below are guesses based on a typical
// POS schema (sales table with total_amount, customer_id, created_at).
// Swap in your real table/column names before deploying.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pushLineMessage } from "@/src/lib/line";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role, this runs server-side only
);

// Protects the endpoint so randoms can't trigger your cron job
function isAuthorized(req: NextRequest) {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Today's date range in Thailand time (UTC+7)
  const now = new Date();
  const thNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const startOfDay = new Date(thNow.setHours(0, 0, 0, 0));
  const startISO = new Date(startOfDay.getTime() - 7 * 60 * 60 * 1000).toISOString(); // back to UTC

  const { data: sales, error } = await supabase
    .from("sales") // 👈 adjust table name
    .select("total_amount, customer_id, created_at") // 👈 adjust columns
    .gte("created_at", startISO);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orderCount = sales?.length ?? 0;
  const totalSales = sales?.reduce((sum, s) => sum + (s.total_amount ?? 0), 0) ?? 0;
  const uniqueCustomers = new Set(
    sales?.filter((s) => s.customer_id).map((s) => s.customer_id)
  ).size;
  const walkIns = orderCount - uniqueCustomers > 0 ? orderCount - uniqueCustomers : 0;

  const dateLabel = thNow.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const message =
    `🧾 สรุปยอดวันนี้ (${dateLabel})\n\n` +
    `💰 ยอดขายรวม: ฿${totalSales.toLocaleString()}\n` +
    `📦 จำนวนบิล: ${orderCount}\n` +
    `👤 ลูกค้าสมาชิก: ${uniqueCustomers}\n` +
    `🚶 ลูกค้าทั่วไป: ${walkIns}`;

  try {
    await pushLineMessage(message);
  } catch (e) {
    console.error("Push failed:", e);
    return NextResponse.json({ error: "push failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, totalSales, orderCount, uniqueCustomers });
}
