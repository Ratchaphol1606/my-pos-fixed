// Staff type a username; Supabase Auth wants an email. This maps one to the other.
// Nobody ever receives mail at these addresses: the admin creates accounts with the
// email pre-confirmed, so the domain only has to look valid.
export const STAFF_EMAIL_DOMAIN =
  process.env.NEXT_PUBLIC_STAFF_EMAIL_DOMAIN || 'staff.boonsamarnshop.com'

// Same rule as the profiles_username_format check in the database.
export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/

export const normalizeUsername = (v: string) => v.trim().toLowerCase()

export const usernameToEmail = (username: string) =>
  `${normalizeUsername(username)}@${STAFF_EMAIL_DOMAIN}`
