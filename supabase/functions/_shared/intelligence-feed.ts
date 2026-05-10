import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface IntelligenceContext {
  profile?: {
    display_name?: string | null;
    roles?: string[] | null;
    top_priorities?: string[] | null;
    current_challenges?: string[] | null;
    risk_tolerance?: string | null;
  } | null;
  goals?: Array<{ title: string; domain?: string | null; description?: string | null; progress?: number | null }> | null;
  domains?: string[] | null;
  location?: string | null;
}

export interface IntelligenceItem {
  id: string;
  category: "markets" | "world" | "national" | "local" | "politics" | "investing" | "mission";
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt?: string | null;
  relevance: number;
  matchedTerms: string[];
}

const FEEDS: Array<{ category: IntelligenceItem["category"]; source: string; url: string; terms: string[] }> = [
  {
    category: "markets",
    source: "Google News",
    url: "https://news.google.com/rss/search?q=NYSE%20OR%20stock%20market%20OR%20S%26P%20500%20when%3A1d&hl=en-US&gl=US&ceid=US:en",
    terms: ["nyse", "stock", "market", "s&p", "nasdaq", "dow"],
  },
  {
    category: "investing",
    source: "Yahoo Finance",
    url: "https://finance.yahoo.com/news/rssindex",
    terms: ["invest", "earnings", "stocks", "bonds", "fed", "rates", "portfolio"],
  },
  {
    category: "world",
    source: "Google News",
    url: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en",
    terms: ["world", "global", "geopolitics", "war", "trade"],
  },
  {
    category: "national",
    source: "Google News",
    url: "https://news.google.com/rss/headlines/section/topic/NATION?hl=en-US&gl=US&ceid=US:en",
    terms: ["national", "united states", "economy", "policy"],
  },
  {
    category: "politics",
    source: "Google News",
    url: "https://news.google.com/rss/headlines/section/topic/POLITICS?hl=en-US&gl=US&ceid=US:en",
    terms: ["politics", "election", "congress", "white house", "policy"],
  },
];

const decodeEntities = (value: string) =>
  value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tagValue = (item: string, tag: string) => {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeEntities(match[1]) : "";
};

const hostFromUrl = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const tokenize = (items: Array<string | null | undefined>) =>
  Array.from(new Set(
    items
      .flatMap((item) => (item || "").toLowerCase().split(/[^a-z0-9$]+/))
      .filter((token) => token.length > 3)
      .slice(0, 80),
  ));

export const buildMissionTerms = (ctx: IntelligenceContext) => {
  const goalText = (ctx.goals || []).flatMap((goal) => [goal.title, goal.description, goal.domain]);
  return tokenize([
    ...(ctx.profile?.roles || []),
    ...(ctx.profile?.top_priorities || []),
    ...(ctx.profile?.current_challenges || []),
    ...(ctx.domains || []),
    ...goalText,
    "NYSE",
    "markets",
    "investing",
    "politics",
    "current events",
  ]);
};

const scoreItem = (title: string, summary: string, baseTerms: string[], feedTerms: string[]) => {
  const haystack = `${title} ${summary}`.toLowerCase();
  const matchedTerms = Array.from(new Set([...baseTerms, ...feedTerms].filter((term) => haystack.includes(term.toLowerCase()))));
  return {
    relevance: Math.min(100, 35 + matchedTerms.length * 12),
    matchedTerms: matchedTerms.slice(0, 8),
  };
};

async function fetchRss(url: string) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "CLRK-Intelligence/1.0",
      Accept: "application/rss+xml,application/xml,text/xml,*/*",
    },
  });
  if (!resp.ok) throw new Error(`Feed returned ${resp.status}`);
  return await resp.text();
}

function parseRss(xml: string, feed: { category: IntelligenceItem["category"]; source: string; terms: string[] }, missionTerms: string[]) {
  const itemMatches = Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)).slice(0, 12);
  return itemMatches.map((match, index) => {
    const raw = match[0];
    const title = tagValue(raw, "title");
    const summary = tagValue(raw, "description");
    const link = tagValue(raw, "link");
    const source = tagValue(raw, "source") || feed.source || hostFromUrl(link);
    const publishedAt = tagValue(raw, "pubDate");
    const scored = scoreItem(title, summary, missionTerms, feed.terms);
    return {
      id: `${feed.category}-${index}-${title.slice(0, 40)}`,
      category: feed.category,
      title,
      summary: summary || title,
      source,
      url: link,
      publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
      relevance: scored.relevance,
      matchedTerms: scored.matchedTerms,
    } satisfies IntelligenceItem;
  }).filter((item) => item.title && item.url);
}

export async function loadUserIntelligenceContext(sb: SupabaseClient, userId: string): Promise<IntelligenceContext> {
  const [profileRes, goalsRes, domainsRes] = await Promise.all([
    sb.from("profiles").select("display_name, roles, top_priorities, current_challenges, risk_tolerance").eq("user_id", userId).single(),
    sb.from("user_goals").select("title, domain, description, progress").eq("user_id", userId).eq("status", "active"),
    sb.from("user_domains").select("domain").eq("user_id", userId).eq("is_active", true),
  ]);

  return {
    profile: profileRes.data,
    goals: goalsRes.data || [],
    domains: (domainsRes.data || []).map((d: { domain: string }) => d.domain),
  };
}

export async function getIntelligenceFeed(ctx: IntelligenceContext, limit = 18): Promise<IntelligenceItem[]> {
  const missionTerms = buildMissionTerms(ctx);
  const localQuery = encodeURIComponent(`${ctx.location || "United States"} local news when:1d`);
  const feeds = [
    ...FEEDS,
    {
      category: "local" as const,
      source: "Google News",
      url: `https://news.google.com/rss/search?q=${localQuery}&hl=en-US&gl=US&ceid=US:en`,
      terms: ["local", "city", "county", "state", "community"],
    },
    {
      category: "mission" as const,
      source: "Google News",
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(`${missionTerms.slice(0, 8).join(" OR ")} when:3d`)}&hl=en-US&gl=US&ceid=US:en`,
      terms: missionTerms,
    },
  ];

  const settled = await Promise.allSettled(feeds.map(async (feed) => parseRss(await fetchRss(feed.url), feed, missionTerms)));
  return settled
    .flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .filter((item, index, all) => all.findIndex((candidate) => candidate.title === item.title) === index)
    .sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return b.relevance - a.relevance || dateB - dateA;
    })
    .slice(0, limit);
}
