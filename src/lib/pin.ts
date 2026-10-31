// PIN hashing for the API routes (node runtime only).
// The PIN is only 4 digits, so the hash alone could never stop a determined guesser.
// What makes it safe is the server-side attempt counter in /api/pin plus the
// user_pins table being unreadable from the browser.
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto'

export const MAX_PIN_ATTEMPTS = 5

export const isValidPin = (v: unknown): v is string => typeof v === 'string' && /^\d{4}$/.test(v)

function derive(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(pin, salt, 32, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))),
  )
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(pin, salt)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function checkPin(pin: string, stored: string): Promise<boolean> {
  const [alg, saltB64, keyB64] = stored.split('$')
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false
  const expected = Buffer.from(keyB64, 'base64')
  const actual = await derive(pin, Buffer.from(saltB64, 'base64'))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
