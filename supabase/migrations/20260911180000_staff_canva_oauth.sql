-- Staff Canva OAuth token storage (server-side only via Edge Function service role).
-- Additive. No client table access.

CREATE TABLE IF NOT EXISTS public.staff_canva_oauth_states (
  state text PRIMARY KEY,
  staff_id uuid NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  code_verifier text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_canva_oauth_states_created_at_idx
  ON public.staff_canva_oauth_states (created_at);

CREATE TABLE IF NOT EXISTS public.staff_canva_tokens (
  staff_id uuid PRIMARY KEY REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scopes text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_canva_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_canva_tokens ENABLE ROW LEVEL SECURITY;

-- Fail closed: no direct authenticated access to OAuth secrets.
REVOKE ALL ON TABLE public.staff_canva_oauth_states FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.staff_canva_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.staff_canva_oauth_states TO service_role;
GRANT ALL ON TABLE public.staff_canva_tokens TO service_role;
