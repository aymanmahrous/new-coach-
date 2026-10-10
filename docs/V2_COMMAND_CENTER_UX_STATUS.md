# Command Center UX Overhaul — Status

## Implemented on `feat/command-center-ux-overhaul`

- Dark-first command-center operating surface with mobile command dock.
- Five-area legacy navigation remains available: Home, Customers, Growth, Bookings, More.
- New unified workspace surface exposes Overview, Today, Action Center, AI Inbox, CRM, Bookings, Content Factory, Media Library, Business Pulse, Automation/Ops, Cloud Workspace, Smart Search, Coach Brain, and Settings entry points.
- Coach Brain is a first-class workspace surface and continues to use the existing authenticated `coach-brain-research` edge function.
- Content Factory keeps the explicit human approval gate; the workspace never claims that publishing happened.
- Cloud Workspace exposes Google Drive, Google Photos, and OneDrive connection states without fabricating an OAuth connection.
- Smart Search UX supports natural-language intent, source scope, and a clear no-fabricated-results state until a real provider is connected.
- No database/RLS/cron/publishing worker changes were introduced by this UX layer.
- No external provider credentials are embedded in client code.

## Deliberate boundary

Real Google Drive/Google Photos/OneDrive search requires an authenticated provider connection and a backend/provider adapter. The UI therefore shows `Needs connection` instead of pretending those accounts are connected. Once the real OAuth/provider adapter is available, results can be surfaced through the same Smart Search surface without redesigning the app.

## Safety

- No real post is published by this workspace.
- Sensitive actions remain preview → approval → execution → audit.
- Source cloud files are never modified by search.
- Existing staff session and Supabase auth boundaries remain the source of truth.
