# identity

Account, session, and recovery behavior. Ported from the HRT tracker and
hardened:

- `JWT_SECRET` is required at startup. There is no fallback secret.
- CORS is restricted to the console origin (`ALLOWED_ORIGIN`), not `*`.
- Rate limits are D1-backed so they hold across Worker isolates.
- Sessions carry an idle timeout; a stolen token on a dormant account is revoked.
- TOTP (RFC 6238) is implemented; passkey registration/verification is stubbed
  for stage 3 (vault) and returns `501` until then.

Routes:

- `POST /api/register`
- `POST /api/login`
- `GET  /api/session`
- `POST /api/logout`
- `GET  /api/user/me`
- `PATCH /api/user/profile`
- `POST /api/user/password`
- `DELETE /api/user/me`
- `POST /api/auth/totp-setup` (issue secret)
- `POST /api/auth/totp-verify` (enable)
- `POST /api/auth/passkey-options` → `501`
- `POST /api/auth/passkey-verify` → `501`
