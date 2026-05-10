REVOKE ALL ON FUNCTION public.match_clrk_memory(UUID, VECTOR(1536), INTEGER, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.match_clrk_memory(UUID, VECTOR(1536), INTEGER, TEXT[]) FROM anon;
REVOKE ALL ON FUNCTION public.match_clrk_memory(UUID, VECTOR(1536), INTEGER, TEXT[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.match_clrk_memory(UUID, VECTOR(1536), INTEGER, TEXT[]) TO service_role;

REVOKE ALL ON FUNCTION public.match_clrk_history(UUID, VECTOR(1536), INTEGER, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.match_clrk_history(UUID, VECTOR(1536), INTEGER, TEXT[]) FROM anon;
REVOKE ALL ON FUNCTION public.match_clrk_history(UUID, VECTOR(1536), INTEGER, TEXT[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.match_clrk_history(UUID, VECTOR(1536), INTEGER, TEXT[]) TO service_role;