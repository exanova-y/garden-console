# Feature Boundaries

Features are vertical product domains. Keep UI, domain rules, and feature-local
API clients together until their size makes a narrower split useful.

Planned domains:

- `identity`: account, session, passkey, and recovery behavior.
- `vault`: client-side encryption and cloud backup lifecycle.
- `health`: interventions, observations, models, and timeline.
- `reading`: curated sources, feed items, and per-user reading state.

The private weekly notes workspace is deliberately not a console feature. It is
hosted separately and linked through stable URLs.
