# Beta gateway and reliability design

## Goal

Make Jelli usable immediately after installing the beta while bounding anonymous gateway abuse, protecting locally supplied provider keys, preserving intended memory, and establishing repeatable quality checks. Installer packaging is deliberately deferred until all changes are complete and verified.

## Gateway

The gateway remains anonymous in `beta-public` mode so an installer needs no account, activation, or API key. It exposes only `POST /v1/chat`.

Each request is assigned a rate-limit principal from Cloudflare's client IP header. A Durable Object owns the counters for that principal, enforcing both a short request window and a daily quota. It returns a typed result including a retry time; the Worker returns `429` with `Retry-After` when denied. The Worker also caps request-body size, message count, individual-message length, and total conversation length before forwarding upstream.

The Worker owns the base Jelli system prompt. Clients send ordered `user` and `assistant` conversation messages plus a bounded, data-only memory-context field. The Worker rejects all client `system` messages, malformed role ordering, and unexpected fields. This prevents the client from replacing platform instructions while preserving local user memory.

An `ACCESS_MODE` configuration value separates the policy from the protocol. `beta-public` is the default beta configuration. A future authenticated mode can validate identity before selecting the same rate-limit principal without changing the client request schema.

## Desktop secrets and memory

The settings JSON keeps non-secret options only. User-owned provider API keys are placed in the operating-system credential vault and retrieved only when sending a request. Existing plaintext `apiKey` settings are migrated by moving the value to the vault and removing it from persisted settings.

Memory has explicit fields for job, location, and interests, and the store updates an existing fact when newer information supersedes it. Extraction and persistence share a single typed mapping so facts marked persistent cannot be silently discarded.

## Quality gates

ESLint ignores generated Rust build output and the existing unused assignment is removed. Tests cover gateway validation and quotas, memory extraction/persistence, and credential persistence boundaries. CI runs frontend lint/type-check/build, Worker type-check/tests, and Rust format/check/test commands.

## Deferred work

Creating or packaging the installer is the final step, after every change above passes its automated checks. No installer-specific JavaScript is introduced earlier.

## Error handling and observability

The Worker returns structured JSON errors for validation/auth/rate-limit failures and retains SSE error semantics after upstream selection. It logs structured, non-sensitive request outcomes (mode, status, selected provider, and rate-limit result) without prompts, API keys, or memory content.
