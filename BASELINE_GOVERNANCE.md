# Baseline Governance

> Historical provenance record: this document describes the repository's initial empty-baseline gate. Source transfer and implementation were completed through later protected pull requests. Use `PROJECT_HANDOFF.md` for current status and authorization boundaries.

## Canonical ownership

- Repository: `aymanmahrous/command-center-hub`
- Visibility: `PRIVATE`
- Default branch: `main`
- Public website repository: `aymanmahrous/swim-fluent-uae`
- Internal Command Center repository: this repository

## Scope boundary

The first baseline contains governance and the audited manifest only. It does not contain `.git` history, Replit history, secrets, environment files, customer data, database schema/migrations, attached assets, generated files, lockfiles, or `.replit`.

The 12 source candidates remain pending selective-transfer gates. The 23 conditional holds remain blocked. The 25 denied/regenerated/out-of-scope paths remain excluded.

## Required gates before source transfer

1. Per-file security allowlist and secret review.
2. Independent QA of path, hash, category, dependency, privacy, and licensing evidence.
3. Explicit implementation ticket with a single owner.
4. Reversible commit and rollback record; no history rewrite.

## Operational prohibitions

No production deployment, external publishing, database migration, n8n runtime, chatbot provider activation, or external customer-data write is implied by this baseline.
