

# CLRK — Cognitive Life Resource Kernel MVP

## Vision
A dark, futuristic personal intelligence system — part command center, part AI advisor, part life dashboard.

## Design System
- **Theme**: Dark sci-fi command center — deep navy/black backgrounds (#0A0E1A), neon cyan (#00F0FF) and electric blue (#3B82F6) accents, subtle glow effects
- **Typography**: Monospace headers (JetBrains Mono or similar), clean sans-serif body (Inter)
- **UI Elements**: Glassmorphism cards, subtle grid/scan-line overlays, animated borders, glowing status indicators
- **Feel**: Like a mission control interface for your life

## Pages & Features

### 1. Landing / Login Page
- Cinematic CLRK branding with animated logo
- "Your Personal Intelligence System" tagline
- Email/password auth via Supabase (sign up + sign in)
- Dark, immersive entry experience

### 2. Onboarding Flow (Post-signup, 4–5 steps)
- Step-by-step structured questionnaire to build User Strategic Profile:
  - **Identity**: Name, roles (founder, parent, etc.), personality type
  - **Goals**: Short-term (this week/month) and long-term (1yr, 5yr) aspirations
  - **Domains**: Which life domains matter most (career, finance, health, relationships)
  - **Preferences**: Communication style, risk tolerance, automation comfort level
  - **Current State**: Main challenges, biggest time drains, top priorities
- Progress bar with sci-fi styling
- Data saved to Supabase `user_profiles` + `user_goals` tables

### 3. Command Center Dashboard
- **Top Bar**: CLRK status indicator, user avatar, current date/time, quick-action buttons
- **Daily Briefing Widget**: AI-generated morning summary (priorities, alerts, opportunities)
- **Goal Tracker**: Visual progress bars for active goals across domains
- **Domain Cards**: Expandable cards for Work, Finance, Health, Relationships — each showing key metrics and status
- **Quick Actions**: "Talk to CLRK", "Add Goal", "Log Activity"
- **Alert Feed**: Smart notifications (deadlines, patterns, opportunities)

### 4. CLRK Chat Interface
- Full-screen chat with CLRK using the detailed system prompt from the spec
- Real AI responses via Lovable AI (Gemini) with streaming
- CLRK system prompt includes the full Super Agent personality, multi-domain awareness, and the user's profile context
- Mode indicators (Strategist, Operator, Coach, etc.) shown in UI
- Markdown rendering for structured responses
- Chat history persisted in Supabase

### 5. Profile & Settings
- View/edit User Strategic Profile
- Domain preferences toggles
- Autonomy level selector (Advisory → Assisted → Autonomous)
- Consent & data controls

## Database (Supabase)
- `profiles` — user identity, preferences, communication style
- `user_goals` — goals with domain, timeframe, status, progress
- `user_domains` — which domains are active, priority order
- `chat_conversations` — conversation threads
- `chat_messages` — message history with role, content, metadata
- `daily_briefings` — cached AI-generated daily summaries
- `user_roles` — role-based access (standard pattern)

## Backend
- **Edge Function: `clrk-chat`** — Streaming chat with full CLRK system prompt + user context injection
- **Edge Function: `generate-briefing`** — Daily briefing generation based on user goals and profile

## MVP Scope Boundaries
- No IoT/device integrations (future)
- No external platform connections (future)
- No sub-agent delegation UI (CLRK responds as unified agent)
- No automation execution (advisory mode only for MVP)
- Financial/health data is user-reported, not connected to external APIs

