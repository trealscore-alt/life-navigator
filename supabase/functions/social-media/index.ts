import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    // Verify user
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const { action, ...params } = await req.json();

    switch (action) {
      case "generate_content": {
        // Use AI to generate social media content
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

        const { platform, topic, tone, contentType } = params;

        const platformGuidelines: Record<string, string> = {
          twitter: "Max 280 characters. Punchy, engaging. Use hashtags sparingly (1-3). Can include thread format.",
          instagram: "Caption-style. Storytelling works well. Use 5-15 relevant hashtags at the end. Emoji-friendly.",
          linkedin: "Professional but authentic. Thought leadership style. Use line breaks for readability. Minimal hashtags (3-5).",
        };

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + LOVABLE_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `You are a world-class social media content creator and marketing strategist. Generate compelling, platform-optimized content.
                
Platform: ${platform}
Guidelines: ${platformGuidelines[platform] || "General social media best practices."}

Rules:
- Write content that drives engagement (likes, comments, shares)
- Match the requested tone exactly
- Include a clear call-to-action when appropriate
- Make it feel authentic, not corporate
- Output ONLY the post content, no explanations or meta-commentary`,
              },
              {
                role: "user",
                content: `Create a ${contentType || "post"} about: ${topic}. Tone: ${tone || "professional but authentic"}.`,
              },
            ],
          }),
        });

        if (!response.ok) throw new Error("AI generation failed");
        const aiData = await response.json();
        const generatedContent = aiData.choices?.[0]?.message?.content || "";

        return new Response(JSON.stringify({ content: generatedContent }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "schedule_post": {
        const { platform, content, scheduledFor, socialAccountId, autoApproved } = params;

        const { data, error } = await sb.from("scheduled_posts").insert({
          user_id: user.id,
          platform,
          content,
          scheduled_for: scheduledFor,
          social_account_id: socialAccountId || null,
          status: autoApproved ? "scheduled" : "pending_approval",
          auto_approved: autoApproved || false,
        }).select().single();

        if (error) throw error;

        return new Response(JSON.stringify({ post: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list_posts": {
        const { status, platform } = params;
        let query = sb.from("scheduled_posts").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        if (status) query = query.eq("status", status);
        if (platform) query = query.eq("platform", platform);

        const { data, error } = await query.limit(50);
        if (error) throw error;

        return new Response(JSON.stringify({ posts: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "approve_post": {
        const { postId } = params;
        const { data, error } = await sb.from("scheduled_posts")
          .update({ status: "scheduled" })
          .eq("id", postId)
          .eq("user_id", user.id)
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify({ post: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "connect_account": {
        const { platform, accountName, accountHandle } = params;

        const { data, error } = await sb.from("social_accounts").insert({
          user_id: user.id,
          platform,
          account_name: accountName,
          account_handle: accountHandle,
        }).select().single();

        if (error) throw error;

        return new Response(JSON.stringify({ account: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list_accounts": {
        const { data, error } = await sb.from("social_accounts")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_active", true);

        if (error) throw error;

        return new Response(JSON.stringify({ accounts: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "disconnect_account": {
        const { accountId } = params;
        const { error } = await sb.from("social_accounts")
          .update({ is_active: false })
          .eq("id", accountId)
          .eq("user_id", user.id);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Social media function error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
