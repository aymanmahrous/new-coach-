# Owner Capability Matrix

This matrix is the compact control map for the current Factory and integration surfaces. It records whether an action is genuinely available instead of inferring capability from a visible button or connection record.

| Area | Owner action | Existing implementation | Current truth | Missing condition |
|---|---|---|---|---|
| Overview | View pipeline and publish evidence | Existing read models and receipts | AVAILABLE for display | External visibility may still require manual confirmation |
| Strategy | Open plan and create a batch | Existing Factory navigation and batch generation | AVAILABLE | Batch creation changes data and must not be used as a connection test |
| Generate | Generate the planned content batch | Existing staff batch generation path | AVAILABLE when owner write access exists | Do not repeat successful generation |
| Content | Edit topic, hook, caption, CTA, hashtags, and visual prompt | Existing content update path | AVAILABLE by lifecycle state | Published items remain locked |
| Content | Approve or request changes | Existing transition and change-request paths | AVAILABLE by lifecycle state | Requires owner write access |
| Content | Schedule or unschedule | Existing transition path | AVAILABLE only for approved or scheduled items | The selected time and lifecycle state must be valid |
| Designs | Create a Canva design | Canva Smart Brief + 1-click Open Canva action + manual upload | AVAILABLE (zero-cost manual brief flow); Developer OAuth LIMITED | Direct Developer OAuth requires Canva Developer App, but Canva Brief flow is 100% operational |
| Reels | Review or propose an existing Reel | Existing content and review records | AVAILABLE when Reel content exists | A proposal is not a generated video |
| Reels | Generate an actual video | Veo 3.1 Edge Function (generate-veo-video) with cost estimate and error diagnostics | AVAILABLE in-app | Upstream Google Veo API availability and model quota (HTTP 502 diagnostics exposed) |
| Campaigns | View current campaign/scheduling state | Existing content batch review data | AVAILABLE for visibility | The workspace does not create a separate publishing workflow |
| Campaigns | Schedule or reschedule | Existing Content lifecycle controls | LIMITED to Content workspace | Item must be approved or scheduled |
| Review | Approve one item or the reviewable batch | Existing review panel and batch approval path | AVAILABLE by lifecycle state | Approval does not publish or schedule from the review screen |
| Review | Request publish | Existing enqueue path with readiness guards | BLOCKED until content and media are ready | Approved content, approved media, confirmed consent, ready-for-review state, and no prior receipt |
| Connections | View provider configuration | Existing integration status view | LIMITED until capability is verified | A connection record alone is not proof of operation |
| Connections | Test local configuration | Existing safe configuration test path | AVAILABLE where the provider contract supports it | Local test does not prove external publishing |
| Connections | Run external publishing or workflow | Outside the read-only audit scope | BLOCKED for audit | Explicit owner approval and a separate controlled execution |
| Media | Confirm consent and approve asset | Owner Media Controls from PR #146 | AVAILABLE when the owner has the required role | Do not reimplement this path |
| Media | Link existing library asset to content item | Multi-tier picker in review panel using `link_staff_media_to_content_item` | AVAILABLE | Requires unlinked content item and existing media asset |
| Media | Upload photo/video from device directly to content item | Direct upload in review panel via `uploadStaffMediaFile` | AVAILABLE | Requires staff session and file selection |
| Media Sources | Cloud sources (Drive/Photos/Dropbox/OneDrive) | Read-only connectors in Media Source Hub | LIMITED (requires client ID setup) | Direct device upload is 100% AVAILABLE without cloud credentials |
| AI Engine | Core AI for Coach Brain & Factory | Google Gemini 2.0 / 3.7 Flash server integration | AVAILABLE | Central server GEMINI_API_KEY; no paid OpenAI API required |
| Publishing | Publish to TikTok | TikTok Content Posting API integration | LIMITED (NEEDS_DEVELOPER_APPROVAL) | TikTok Developer App registration, Direct Post audit approval, domain verification |
| Messaging | Shared Concierge AI & Human Takeover | Centralized `process_ai_sales_concierge_turn` in `AIInboxView` | AVAILABLE for WhatsApp; LIMITED for Messenger/IG Direct | Webhook subscriptions and Page access tokens for Meta channels |

## Status rules

**AVAILABLE** means the current application contract can perform the action under its stated lifecycle and permission conditions. **LIMITED** means the UI can display or prepare the work, but a provider, verification step, or separate workspace is still required. **BLOCKED** means the application must prevent the action. **NOT_CONFIGURED** means the provider or required setting is absent.

## Audit rule

A new agent must read this matrix before inspecting or implementing an owner capability. If the matrix says a capability is complete, the agent must not rebuild it without a new reproducible failure.

## References

[1]: https://github.com/aymanmahrous/command-center-hub/pull/146 "Command Center Hub Owner Media Controls PR #146"
