# Nightingale MVP threat model

Scope: school prototype using fictional drill data. This is an engineering summary,
not a formal threat assessment.

| Threat | MVP control | Remaining limitation |
| --- | --- | --- |
| Unauthorized API access | Bearer/API-key authentication and permission checks | No production identity provider or MFA |
| Cross-actor asset access | Actor-bound asset ownership and admin override | No incident/case-scoped sharing policy |
| Network interception | Device rejects HTTP outside mock mode | Production certificate and network deployment still need review |
| Tampered audit event | Hash-chained append-only audit storage | Requires protected centralized retention and monitoring |
| Lost or copied device token | Per-device token | Rotation and revocation workflow is not complete |
| Oversized upload / memory abuse | Bounded upload body reader | Broader rate limiting and resource quotas are still needed |
| Local media theft | Restrictive queue, drill, and crashpad permissions | Host hardening and disk/KMS encryption remain deployment tasks |
| Dependency vulnerability | Locked dependencies and planned audit checks | `cargo audit`/`cargo deny` still need to run in CI |
| Sensitive data in logs | Device logging avoids transcript/audio/image content | Operational log review is still required |
