<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { feedSources, loadSource } from '../lib/feed'
import type { FeedArticle } from '../lib/feed'

const props = defineProps<{ language: 'zh' | 'en'; timezone: string }>()
/** Stories shown per source. */
const perSource = 3
const refreshInterval = 5 * 60 * 1000
const retryDelay = 30 * 1000
const requestTimeout = 20 * 1000
const endpoint = `${(import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')}/api/rss/v1/news/list`
const messages = {
  zh: {
    title: '资讯',
    loading: '正在读取资讯…',
    unavailable: '暂时读取不到，稍后会自动重试。',
    empty: '暂时没有文章。',
  },
  en: {
    title: 'Feed',
    loading: 'Loading stories…',
    unavailable: 'Unavailable right now. It will retry shortly.',
    empty: 'No stories yet.',
  },
}
const t = computed(() => messages[props.language])
const locale = computed(() => (props.language === 'zh' ? 'zh-CN' : 'en-US'))
/** Last stories read per source. A failed refresh keeps what is already here. */
const stories = ref<Record<string, FeedArticle[]>>({})
const failed = ref<Record<string, boolean>>({})
const loading = ref(false)
const now = ref(Date.now())
let controller: AbortController | undefined
let next: ReturnType<typeof setTimeout> | undefined
let clock: ReturnType<typeof setInterval> | undefined
let loadedAt = 0
let failures = 0
let disposed = false

const columns = computed(() =>
  feedSources.map((source) => ({
    id: source.id,
    name: props.language === 'zh' ? source.name : source.englishName,
    articles: stories.value[source.id] ?? [],
    failed: failed.value[source.id] ?? false,
  })),
)
// Formatting never throws: a time that cannot be formatted is simply left out.
function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(locale.value, {
      timeZone: props.timezone,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return ''
  }
}
// Recent stories read as "5 minutes ago"; older ones keep a short date.
function formatRelative(value: string) {
  try {
    const minutes = Math.round((now.value - Date.parse(value)) / 60000)
    if (minutes >= 0 && minutes < 24 * 60) {
      const relative = new Intl.RelativeTimeFormat(locale.value, {
        numeric: 'auto',
        style: 'narrow',
      })
      return minutes < 60
        ? relative.format(-minutes, 'minute')
        : relative.format(-Math.round(minutes / 60), 'hour')
    }
    return new Intl.DateTimeFormat(locale.value, {
      timeZone: props.timezone,
      month: 'short',
      day: 'numeric',
    }).format(new Date(value))
  } catch {
    return ''
  }
}
// The page keeps itself current, so there is nothing to press.
async function refresh() {
  if (loading.value || disposed) return
  clearTimeout(next)
  const current = new AbortController()
  controller = current
  const timeout = setTimeout(() => current.abort(), requestTimeout)
  loading.value = true
  // One request per source: a source that fails or hangs never takes the others with it.
  const results = await Promise.allSettled(
    feedSources.map((source) => loadSource(endpoint, source.id, perSource, current.signal)),
  )
  clearTimeout(timeout)
  if (disposed) return
  let ok = true
  results.forEach((result, index) => {
    const id = feedSources[index]!.id
    if (result.status === 'fulfilled') stories.value[id] = result.value
    else ok = false
    failed.value[id] = result.status === 'rejected'
  })
  loading.value = false
  now.value = Date.now()
  if (ok) loadedAt = now.value
  failures = ok ? 0 : failures + 1
  // Retry soon at first, then back off so an API that is down is not hammered.
  next = setTimeout(
    refresh,
    ok ? refreshInterval : Math.min(retryDelay * 2 ** (failures - 1), refreshInterval),
  )
}
function catchUp() {
  if (!document.hidden && Date.now() - loadedAt > refreshInterval) void refresh()
}
onMounted(() => {
  void refresh()
  document.addEventListener('visibilitychange', catchUp)
  window.addEventListener('online', catchUp)
  clock = setInterval(() => {
    now.value = Date.now()
  }, 60000)
})
onUnmounted(() => {
  disposed = true
  controller?.abort()
  clearTimeout(next)
  clearInterval(clock)
  document.removeEventListener('visibilitychange', catchUp)
  window.removeEventListener('online', catchUp)
})
</script>

<template>
  <section class="feed" :aria-busy="loading">
    <h2 class="visually-hidden">{{ t.title }}</h2>
    <section v-for="column in columns" :key="column.id" class="feed-source">
      <h3 translate="no">{{ column.name }}</h3>
      <ul v-if="column.articles.length">
        <li v-for="article in column.articles" :key="article.id">
          <a :href="article.url" target="_blank" rel="noopener noreferrer" :title="article.title">
            <span class="feed-title">{{ article.title }}</span>
            <time
              v-if="article.publishedAt"
              :datetime="article.publishedAt"
              :title="formatDate(article.publishedAt)"
              >{{ formatRelative(article.publishedAt) }}</time
            >
          </a>
        </li>
      </ul>
      <ul v-else-if="loading" class="feed-skeleton" role="status" :aria-label="t.loading">
        <li v-for="row in perSource" :key="row" aria-hidden="true"><i></i><i></i><i></i></li>
      </ul>
      <p v-else role="status">{{ column.failed ? t.unavailable : t.empty }}</p>
    </section>
  </section>
</template>

<style scoped>
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.feed {
  width: min(100%, 1480px);
  margin: 0 auto;
  padding-bottom: 72px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 44px 36px;
}
.feed-source {
  min-width: 0;
}
.feed-source h3 {
  margin: 0;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
}
.feed-source ul {
  list-style: none;
  margin: 0;
  padding: 6px 0 0;
}
.feed-source a {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  margin: 0 -10px;
  padding: 10px;
  border-radius: 6px;
  color: var(--ink);
  text-decoration: none;
}
.feed-source a:hover {
  background: var(--hover);
}
.feed-source a:active {
  background: var(--active);
}
.feed-source a:focus-visible {
  outline-offset: -2px;
}
.feed-source a:visited .feed-title {
  color: var(--muted);
}
/* Two fixed lines keep the rows of all five columns level. */
.feed-title {
  font-size: 14px;
  line-height: 1.55;
  height: 3.1em;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}
.feed-source time {
  font-family: var(--mono);
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
  white-space: nowrap;
}
.feed-source p {
  margin: 0;
  padding: 16px 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--muted);
}
/* Same shape as a loaded story: two title lines and a short time line. */
.feed-skeleton li {
  display: flex;
  flex-direction: column;
  padding: 10px 0;
  animation: feed-wait 1.4s ease-in-out infinite;
}
.feed-skeleton i {
  height: 12px;
  margin: 4.85px 0;
  border-radius: 4px;
  background: var(--active);
}
.feed-skeleton i:nth-child(2) {
  width: 62%;
}
.feed-skeleton i:last-child {
  width: 28%;
  height: 10px;
  margin: 7px 0 3px;
}
@keyframes feed-wait {
  50% {
    opacity: 0.45;
  }
}
@media (max-width: 1200px) {
  .feed {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 860px) {
  .feed {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 700px) {
  .feed {
    gap: 36px;
    padding-bottom: 48px;
  }
}
@media (max-width: 560px) {
  .feed {
    grid-template-columns: 1fr;
  }
  /* A single column has no neighbours to line up with. */
  .feed-title {
    height: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .feed-skeleton li {
    animation: none;
  }
}
</style>
