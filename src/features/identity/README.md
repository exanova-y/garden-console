# identity

Account, session, and recovery behavior. Ported from the HRT tracker and
hardened:

- `JWT_SECRET` is required at startup. There is no fallback secret.
- CORS is restricted to the console origin (`ALLOWED_ORIGIN`), not `*`.
- Rate limits are D1-backed so they hold across Worker isolates.
- Sessions carry an idle timeout; a stolen token on a dormant account is revoked.
- TOTP (RFC 6238) and passkey registration/assertion are implemented.

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
- `POST /api/auth/passkey-options`
- `POST /api/auth/passkey-verify`
