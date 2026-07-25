# vault

Fail-closed encrypted backup and passkey support.

## What changed from the upstream tracker

The upstream HRT tracker can save plaintext backups when a password-derived
key is unavailable (e.g. passkey login on a new device). For a public
health-data service this is unacceptable. The vault module enforces:

- **Fail-closed**: if no encryption key is available, cloud save is refused.
  The server never receives plaintext health data.
- **Passkey gating**: after passkey login on a new device, the user must enter
  their password to derive the encryption key before cloud backup works.
- **Password change re-derives the key**: old backups become unreadable, which
  also stops an admin who resets the password from decrypting them.

## Routes

- `GET    /api/content` — list backups (metadata only with `?meta=1`)
- `POST   /api/content` — save encrypted backup
- `GET    /api/content/:id` — load one backup
- `DELETE /api/content/:id` — delete one backup
- `POST   /api/auth/passkey-register` — begin WebAuthn registration
- `POST   /api/auth/passkey-register-verify` — finish registration
- `POST   /api/auth/passkey-options` — begin assertion (login)
- `POST   /api/auth/passkey-verify` — finish assertion

## Client crypto

`deriveCloudKey(password, userId)` — PBKDF2 (SHA-256, 210k iterations) →
256-bit AES-GCM key.

`encryptCloudPayload(plaintext, keyBase64)` / `decryptCloudPayload(envelope,
keyBase64)` — AES-GCM with a random IV. The envelope is `{ v: 1, iv, data }`.

The Worker validates this envelope shape and rejects plaintext payloads with
`415`, so fail-closed behavior does not depend on the frontend alone.

The key is cached in `localStorage['enc_key']` only after it has successfully
decrypted a backup, so a wrong password never poisons future saves.
