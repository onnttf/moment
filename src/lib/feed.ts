/** A news source as listed by `GET /api/rss/v1/config`. */
export interface FeedSource {
  id: string
  /** English display name. */
  name: string
  /** Chinese display name. */
  nameZh: string
}

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

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function timestamp(article: FeedArticle) {
  return article.publishedAt ? Date.parse(article.publishedAt) : -Infinity
}

/**
 * Reads the body of `GET /api/rss/v1/config`. A body without a source list throws;
 * entries without an id or any name, and repeated ids, are skipped. A missing name falls
 * back to the other language so both are always present.
 */
export function parseConfig(body: unknown): FeedSource[] {
  const data = isRecord(body) ? body.data : null
  if (!isRecord(data) || !Array.isArray(data.sources)) throw new Error('Invalid news config')
  const seen = new Set<string>()
  const sources: FeedSource[] = []
  for (const item of data.sources) {
    if (!isRecord(item)) continue
    const id = text(item.source_id)
    const name = text(item.name)
    const nameZh = text(item.name_zh)
    if (!id || seen.has(id) || !(name || nameZh)) continue
    seen.add(id)
    sources.push({ id, name: name || nameZh, nameZh: nameZh || name })
  }
  return sources
}

/** Reads a source list this page saved earlier. Anything unexpected yields an empty list. */
export function parseSavedSources(saved: string | null): FeedSource[] {
  try {
    const value: unknown = JSON.parse(saved ?? '')
    if (!Array.isArray(value)) return []
    return value.filter(
      (item): item is FeedSource =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.nameZh === 'string' &&
        item.id !== '',
    )
  } catch {
    return []
  }
}

/** Reads a list of source ids this page saved earlier. Anything unexpected yields none. */
export function parseSavedIds(saved: string | null): string[] {
  try {
    const value: unknown = JSON.parse(saved ?? '')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** Returns up to `count` distinct items in random order without changing `items`. */
export function pickRandom<T>(items: readonly T[], count: number, random = Math.random): T[] {
  const pool = [...items]
  const size = Math.max(0, Math.min(count, pool.length))
  for (let i = 0; i < size; i++) {
    const j = i + Math.floor(random() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool.slice(0, size)
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

async function getJson(url: string, signal: AbortSignal, fetcher: typeof fetch) {
  const response = await fetcher(url, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as unknown
}

/** Loads the sources the API offers. `api` is the RSS API root, e.g. `/api/rss/v1`. */
export async function loadConfig(
  api: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<FeedSource[]> {
  return parseConfig(await getJson(`${api}/config`, signal, fetcher))
}

/** Loads the latest stories of one source. Rejects on any network, HTTP or format problem. */
export async function loadSource(
  api: string,
  sourceId: string,
  limit: number,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<FeedArticle[]> {
  const url = `${api}/news/list?source_id=${encodeURIComponent(sourceId)}&limit=${limit}`
  return parseNewsList(await getJson(url, signal, fetcher), limit)
}
