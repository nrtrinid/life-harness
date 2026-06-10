# Security

Life Harness is a **local-first personal tool**. It is not hardened for multi-user or internet-facing deployment.

## Threat model (v0.1)

```text
Single user on their own machine
Local seed / JSON state in browser storage (web)
Optional localhost-only AI gateway and Job Scout runner
No auth, no cloud sync, no multi-tenant data
```

## Sensitive data

- Cards, logs, and memory may include personal career, money, or health-adjacent notes.
- Sensitivity levels (`S0`–`S3`) govern future AI routing — `S3` must never leave the device to a provider.
- Do not paste secrets, credentials, or `S3`-class content into Raw Lab or cloud tools.

## Services

| Service | Bind | Notes |
|---------|------|-------|
| `services/ai-gateway` | `127.0.0.1:8111` | Do not expose to LAN/WAN without reviewing prompt logging |
| `services/job-scout-runner` | `127.0.0.1:8122` | Fetches only user-configured approved URLs |

## Reporting

This is a private project. If you are a collaborator and find a concern, contact the repository owner directly.

## Out of scope (v0.1)

- Penetration testing, bug bounty, CVE process
- Encrypted-at-rest guarantees beyond OS/browser defaults
- Supply-chain audit of npm/PyPI dependencies (use `npm audit` / lockfiles as needed)
