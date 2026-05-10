REVOKE ALL ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(UUID, app_role) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(UUID, app_role) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;