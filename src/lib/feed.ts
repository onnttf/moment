/** Sources shown on the page. The ids are the ones the news API's catalog uses. */
export const feedSources = [
  { id: 'sspai', name: '少数派', englishName: 'SSPAI' },
  { id: 'ithome', name: 'IT之家', englishName: 'IT Home' },
  { id: 'hacker-news', name: 'Hacker News', englishName: 'Hacker News' },
  { id: 'verge', name: 'The Verge', englishName: 'The Verge' },
  { id: 'bbc', name: 'BBC World', englishName: 'BBC World' },
] as const

export interface FeedArticle {
  /** The normalized article URL, unique within one source. */
  id: string
  title: string
  url: string
  publishedAt: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function timestamp(article: FeedArticle) {
  return article.publishedAt ? Date.parse(article.publishedAt) : -Infinity
}

/**
 * Reads the body of `GET /api/rss/v1/news/list`. Nothing in it is trusted: a body that is
 * not a news list throws, and single items that cannot be shown safely are skipped.
 * The API answers application errors with HTTP 200 and `data: null`, which throws here.
 */
export function parseNewsList(body: unknown, limit: number): FeedArticle[] {
  const data = isRecord(body) ? body.data : null
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error('Invalid news response')
  const seen = new Set<string>()
  const articles: FeedArticle[] = []
  for (const item of data.items) {
    if (!isRecord(item) || typeof item.title !== 'string' || typeof item.url !== 'string') continue
    const title = item.title.trim()
    let url: URL
    try {
      url = new URL(item.url)
    } catch {
      continue
    }
    // Only web links may become an href.
    if (!title || (url.protocol !== 'https:' && url.protocol !== 'http:')) continue
    if (seen.has(url.href)) continue
    seen.add(url.href)
    const time = typeof item.published_at === 'string' ? Date.parse(item.published_at) : NaN
    articles.push({
      id: url.href,
      title,
      url: url.href,
      publishedAt: Number.isFinite(time) ? new Date(time).toISOString() : null,
    })
  }
  // Newest first, stories without a date last.
  return articles.sort((a, b) => timestamp(b) - timestamp(a)).slice(0, limit)
}

/** Loads the latest stories of one source. Rejects on any network, HTTP or format problem. */
export async function loadSource(
  endpoint: string,
  sourceId: string,
  limit: number,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<FeedArticle[]> {
  const response = await fetcher(
    `${endpoint}?source_id=${encodeURIComponent(sourceId)}&limit=${limit}`,
    { signal, headers: { Accept: 'application/json' } },
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return parseNewsList(await response.json(), limit)
}
