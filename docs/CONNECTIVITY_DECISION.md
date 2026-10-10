# Connectivity decision

The standalone browser app may use only the Supabase project URL and a browser-safe publishable key (or the legacy `anon`-role fallback). These are public client identifiers and are not server secrets. No live project URL or API key is committed; deployment and local environment variables must provide them.

The application must remain fail-closed when configuration is invalid. No service-role key, database password, webhook secret, scheduler secret, provider token, or other server credential may be committed or exposed to the browser.
