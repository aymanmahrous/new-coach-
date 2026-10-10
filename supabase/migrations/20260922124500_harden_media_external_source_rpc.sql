-- Media Source Hub: the external asset linker is staff-only.
-- SECURITY DEFINER must not remain executable by anon or the public role.

REVOKE EXECUTE ON FUNCTION public.register_staff_external_media_asset(text, text, text, text, text, text, text, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_staff_external_media_asset(text, text, text, text, text, text, text, bigint, text, text) TO authenticated, service_role;
