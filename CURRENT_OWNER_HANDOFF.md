# Current Owner Handoff

**Status:** Active reference for Command Center Hub

## What is already complete

PR #146 added the Owner Media Controls. The Media Library is not read-only when the owner has the required role. Its existing controls use the current staff media RPC path for category, consent, media status, and review actions.

The Factory already contains the stages Overview, Strategy, Generate, Content, Designs, Reels, Campaigns, Review, and Connections. Content editing uses the existing content update and transition paths. Batch generation and batch approval use the existing staff batch procedures.

## What this phase changes

This phase does not add a database migration, RPC, provider, OAuth flow, scheduler, queue, or publishing workflow. It makes the current UI truthful about capability state and aligns review workspaces with their actual scope.

The current capability states are:

- **AVAILABLE:** verified as usable by the application.
- **LIMITED:** partially available or not verified end to end.
- **BLOCKED:** prevented by state, permission, consent, or readiness.
- **NOT_CONFIGURED:** no usable provider configuration is present.

## Factory behavior

Designs shows items that do not yet have a linked media asset. Canva Generate is not presented as an available action unless the capability is explicitly verified as available. If Canva is disconnected or unverified, the owner sees a clear limited message.

Reels shows Reel content separately. Existing Reel analysis and proposal work are separate from actual video generation. Video generation is limited until a verified video provider is available.

Campaigns shows campaign and scheduling state. Scheduling remains in the Content workspace where the existing lifecycle controls live. The Campaigns workspace does not claim to provide an independent publish action.

Review shows reviewable and approved items. Publish requests require approved content and marketing-eligible media with confirmed consent and ready-for-review publishability.

## Connection truth rule

A connection record or a reported connected flag does not prove that an external capability works. The UI must distinguish configured state from verified capability. External testing, publishing, and workflow execution are separate operations and must not be triggered by a read-only audit.

## Safety boundary

Do not run n8n, Meta, Canva, or live publishing as a UI test. Do not create media to make a button appear available. Do not change Instagram IDs. Do not add a migration or RPC unless the current capability matrix proves the existing contracts cannot support the required action.

## Verification record

The current focused changes are limited to the Factory capability display, workspace scoping, and lifecycle gating. No database, RLS, Auth, n8n workflow, Meta campaign, deployment, commit, or PR was changed as part of this phase.

## References

[1]: https://github.com/aymanmahrous/command-center-hub/pull/146 "Command Center Hub Owner Media Controls PR #146"

[2]: https://command-center-hub-swimmingayman-8492s-projects.vercel.app "Command Center Hub Production"
