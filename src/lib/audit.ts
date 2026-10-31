// Server-side audit trail (node runtime). Writes one row per sensitive action with the
// service role; the browser can neither write nor change these rows (RLS, see
// audit_migration.sql). Row-level changes to products / customers / settings are
// recorded by database triggers instead, because those are edited straight from the page.
//
// Logging is best effort on purpose: a failure here is reported to the server log but
// never blocks the action itself. NEVER pass a password or PIN in any field.
import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditActor = { id?: string | null; username?: string | null; role?: string | null }

export type AuditEntry = {
  action: string
  entity?: string
  entityId?: string | null
  summary?: string
  oldData?: unknown
  newData?: unknown
}

export async function logAudit(admin: SupabaseClient, actor: AuditActor, entry: AuditEntry): Promise<void> {
  try {
    const { error } = await admin.from('audit_log').insert({
      user_id: actor.id ?? null,
      username: actor.username ?? null,
      role: actor.role ?? null,
      action: entry.action,
      entity: entry.entity ?? null,
      entity_id: entry.entityId ?? null,
      summary: entry.summary ? entry.summary.slice(0, 200) : null,
      old_data: entry.oldData ?? null,
      new_data: entry.newData ?? null,
    })
    if (error) console.error('[audit] insert failed:', entry.action, error.message)
  } catch (e) {
    console.error('[audit] insert threw:', entry.action, e)
  }
}
