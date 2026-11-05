# Nightingale privacy and security readiness

This checklist records MVP safeguards and unresolved work for an Ontario emergency
responder-to-hospital handoff prototype. It is not a PHIPA or MFIPPA certification,
legal opinion, privacy impact assessment, threat model, or approval to use real
patient information.

## Implemented MVP guardrails

- Production API startup fails closed unless scoped API keys are configured.
- Bearer/API-key authentication and permission checks protect patient-data, ingest,
  audit, and development routes.
- Asset reads are actor-bound, with an explicit administrator override.
- Upload parts are bounded, including chunked request bodies.
- Reads, writes, vault access, and pipeline-generated drafts are audit events.
- The production server uses durable append-only JSONL audit storage with hash-chain
  verification and serialized writes.
- Local crashpad, drill, transcript, and media files use restrictive permissions.
- S3-compatible vault writes request server-side AES-256 encryption.
- The server sends no-store, no-sniff, clickjacking, referrer, and CSP headers.

## Required before any real patient information

### Governance and legal

- Identify the responsible health information custodian and any MFIPPA institution,
  privacy officer, agents, and service providers.
- Obtain legal/privacy review of authority for collection, use, disclosure, and the
  responder-to-hospital handoff.
- Complete a privacy impact assessment, threat/risk assessment, and union/workforce
  consultation where applicable.
- Publish information practices, contact details, access/correction procedures,
  complaint handling, and patient-facing notices.

### Identity and access

- Replace shared API keys with an approved identity provider, MFA, short-lived
  tokens, key rotation, revocation, device identity, and organization membership.
- Implement least-privilege role and incident/case authorization, approved sharing,
  break-glass reason capture and review, and separation of duties.
- Add access/correction workflows and verify that audit access is restricted to
  authorized privacy/security staff.

### Data lifecycle and operations

- Define collection minimization, retention schedules, legal holds, secure deletion,
  backup expiry, export, and disaster recovery procedures.
- Add breach detection, containment, investigation, notification, and IPC reporting
  workflows; test them with tabletop exercises.
- Review every external model, storage, hosting, and support provider for contracts,
  permitted data use, residency, encryption, sub-processors, and breach obligations.
- Use managed key encryption, centralized monitoring, alerting, immutable audit-log
  retention, vulnerability scanning, penetration testing, and independent review.

### Product and deployment

- Replace the demo browser sign-in and unprotected client token flow with a real
  authenticated session/token exchange; never bundle administrator or device secrets.
- Remove fictional drill defaults, fake identities, default vault credentials, and
  development routes from production deployments.
- Validate the complete deployment, device, network, backup, and logging boundary
  under the custodian's approved architecture.
