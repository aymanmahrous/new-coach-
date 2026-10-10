# Media Source Hub and Creative Factory

## Implemented in this update

The Media Library now contains a unified operating workspace for four requested sources: Google Drive, Google Photos, Dropbox, and OneDrive. It provides provider status, provider filtering, asset search, source opening, consent-aware selection, and a Creative Factory panel that turns a selected image or video into a bilingual creative brief with channel formats, CTA, compliance rules, and an owner-review gate.

The workflow is intentionally fail-closed. Assets marked as blocked cannot be selected for marketing use, and every generated brief remains `needs_review` until the owner approves it. No publishing action was added and no external provider credential is stored in browser storage.

## Live activation requirements

The repository is a static authenticated frontend. Live provider search requires browser-safe OAuth client configuration and provider-specific authorization flows. The following environment values are expected to be added only after the corresponding applications are created:

| Provider | Browser configuration | Minimum read scope | Current state |
| --- | --- | --- | --- |
| Google Drive | `VITE_GOOGLE_DRIVE_CLIENT_ID` | `https://www.googleapis.com/auth/drive.readonly` | Existing Drive manager; unified hub adapter ready |
| Google Photos | `VITE_GOOGLE_PHOTOS_CLIENT_ID` | `photoslibrary.readonly` | UI contract ready; OAuth and API adapter required |
| Dropbox | `VITE_DROPBOX_CLIENT_ID` | `files.content.read` | UI contract ready; OAuth and API adapter required |
| OneDrive | `VITE_ONEDRIVE_CLIENT_ID` | `Files.Read` | UI contract ready; OAuth and Graph adapter required |

Client secrets must never use `VITE_*` variables. If a provider needs a confidential-token exchange, it must be implemented in an approved server-side function with a redirect URI, secret storage, and an audit log. The current update does not create or enable those external credentials.

## Remaining production work

1. Add provider-specific OAuth callback and token exchange functions in the approved backend boundary.
2. Replace the illustrative provider results with paginated live API responses and signed previews.
3. Persist selected source metadata, consent, expiry, and audit events through approved RPCs.
4. Connect the Creative Factory brief to Canva/video generation only after the asset has an approved consent state.
5. Add owner approval and receipt tracking before any live publishing integration is enabled.

## Verification

- `npm run verify` passed.
- 170 tests passed.
- TypeScript passed.
- Production build passed.
- Performance budget passed.

The live integrations remain intentionally unconnected until the owner supplies or enables the required provider applications and approved server-side secrets.
