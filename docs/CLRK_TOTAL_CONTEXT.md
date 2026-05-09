# CLRK Total Context Layer

CLRK does not pretend to have private data it has not been granted. The framework is designed around permissioned context:

- **CLRK-owned history**: conversations, rolling summaries, tasks, subagents, memory, device readings, and agent messages.
- **Imported personal history**: browser exports, transcripts, files, notes, vehicle logs, robot observations, and device streams after the user connects or imports them.
- **Live internet**: web search and URL fetch tools for current facts, citations, docs, prices, schedules, laws, and research.

## Database

`clrk_history_events` stores durable history events:

- `source`: where it came from, such as `conversation`, `import`, `web`, `robot`, `device`, `task`, or `manual`
- `kind`: what it is, such as `note`, `transcript`, `observation`, `file`, `page`, `task_result`, or `device_context`
- `content`: searchable event text
- `embedding`: optional vector for semantic recall

## Tools

- `search_history`: searches CLRK-owned and imported history.
- `write_history_event`: stores an approved event into the history index.
- `web_search`: searches the internet through `TAVILY_API_KEY`, `SERPER_API_KEY`, or `BRAVE_SEARCH_API_KEY`.
- `fetch_url`: fetches a public URL and extracts readable text. Local/private network URLs are blocked.

## Environment

Set one of these in the Supabase Edge Function environment to enable live search:

```bash
TAVILY_API_KEY=...
SERPER_API_KEY=...
BRAVE_SEARCH_API_KEY=...
```

Without a provider key, CLRK will report that internet search is not configured instead of inventing results.
