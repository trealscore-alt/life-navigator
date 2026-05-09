# CLRK End-to-End Test Report

Date: May 9, 2026

## Local App

Passing:

- Vite production build
- Vitest test suite
- Focused lint on Auth, Dashboard, Chat, Autonomy Center, Device Hub, Live Mode, voice commands, and shared CLRK agent prompt/tool files
- Device Mesh TypeScript check
- Robot Runtime TypeScript check
- Browser smoke test for signed-out auth and protected route redirect

## Live Supabase Backend

Working:

- `clrk-live`
- `clrk-chat`
- `generate-briefing`
- `agent-gateway`
- Existing base tables: profiles, goals, conversations, messages, briefings, device data, external agents, social tables

Blocked:

- `clrk-agent` returns 404 in the live project. The Chat UI now falls back to `clrk-chat` so users still get a CLRK response, but structured server/client tool calling requires deploying `clrk-agent`.
- Runtime tables are missing from the live schema:
  - `clrk_tasks`
  - `clrk_memory`
  - `chat_summaries`
  - `clrk_subagents`
  - `clrk_subagent_runs`
  - `clrk_history_events`

## Required Backend Deployment

Apply these migrations to the live Supabase project:

```bash
supabase db push
```

Deploy the new agent function:

```bash
supabase functions deploy clrk-agent
```

The local Supabase CLI profile available during this test was not linked to project `ytnnkqdgnztzgtcpeetl`, so the backend deployment could not be completed from this machine session.
