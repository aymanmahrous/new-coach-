# Read-only Operations Modules Handoff

Document status: historical initial-read baseline. Later protected stages added only the controlled RPC mutations listed in `README.md`; this document is not the current mutation inventory.

## Scope completed

The standalone Command Center now loads authenticated operational data through existing Supabase RPC contracts for:

- Command Center: `get_staff_command_center`
- AI Inbox: `get_staff_inbox`
- CRM: `get_staff_crm_leads`
- Automations status: `get_staff_content_automation_status`
- Content Studio: `get_staff_content_items`
- Planner/bookings: `get_staff_bookings`
- Media Library: `get_staff_media_assets`
- Analytics: `get_staff_growth_analytics`
- Integrations/operations queue: `get_staff_operations_queue`

## Security boundary

- Authentication remains Supabase password authentication with a browser-safe publishable key.
- Every RPC call uses the signed-in employee JWT.
- No service-role key is present.
- No mutation RPC is called.
- No migration, seed, cron, worker, publishing, messaging, or external notification is introduced.
- A failed RPC shows a safe read-only error and performs no fallback write.
- HTTP 401 clears the local session and returns to login.

## Rollback

Revert the feature merge commit or restore the previous Vercel deployment. The public website and its deployment remain independent and unchanged.
