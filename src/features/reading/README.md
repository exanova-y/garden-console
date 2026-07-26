# Reading

Shared information stream sourced from owner-connected Gmail and Feedly
accounts. Every guest sees the same normalized articles; connector credentials
remain owner-only and encrypted in D1.

The workbench is stream-first: all articles stay on the left and open as editor
panes on the right. It supports left/right/up/down splits and keyboard triage.
`k` reranks with explicit interest tags, recency, source diversity, and a small
seeded jitter. The interest seed is reviewable in `interests.ts`; Curius has no
documented API, so no Curius connector is used.
