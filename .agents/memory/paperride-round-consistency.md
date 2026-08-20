---
name: PaperRide round consistency
description: Why current-round creation and selection must remain serialized and deterministic.
---

PaperRide must serialize current-round creation with a database-wide advisory lock and select the current round with a deterministic tie-breaker.

**Why:** The client polls the current round. Concurrent reads at a round boundary can otherwise create several active rounds, leaving a submitted ride in a different round from the one later shown in the UI.

**How to apply:** Preserve the database lock around the check-and-create path and keep deterministic ordering whenever selecting the active round. Any future worker or API path that opens rounds must use the same serialization rule.