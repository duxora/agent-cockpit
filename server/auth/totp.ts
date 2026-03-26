import * as OTPAuth from 'otpauth'
import crypto from 'crypto'

export function generateTotpSecret(): string {
  const secret = new OTPAuth.Secret()
  return secret.base32
}

export function getTotpUri(base32Secret: string, username: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: 'AgentCockpit',
    label: username,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  })
  return totp.toString()
}

export function verifyTotpCode(base32Secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(base32Secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  })
  const delta = totp.validate({ token: code, window: 1 })
  return delta !== null
}

export function encryptSecret(plaintext: string, hexKey: string): string {
  const key = Buffer.from(hexKey, 'hex')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptSecret(encrypted: string, hexKey: string): string {
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':')
  const key = Buffer.from(hexKey, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(ciphertext) + decipher.final('utf8')
}
