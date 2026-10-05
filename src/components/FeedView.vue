<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { loadConfig, loadSource, parseSavedIds, parseSavedSources, pickRandom } from '../lib/feed'
import type { FeedArticle, FeedSource } from '../lib/feed'

const props = defineProps<{ language: 'zh' | 'en'; timezone: string }>()
/** Stories shown per source. */
const perSource = 3
/** Columns on screen: the most a viewer can choose, and how many a random draw fills. */
const maxSources = 5
const refreshInterval = 5 * 60 * 1000
const retryDelay = 30 * 1000
const requestTimeout = 20 * 1000
const api = `${(import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')}/api/rss/v1`
const messages = {
  zh: {
    title: '资讯',
    loading: '正在读取资讯…',
    unavailable: '暂时读取不到，稍后会自动重试。',
    empty: '暂时没有文章。',
    chooseSources: '选择来源',
    searchSources: '搜索来源…',
    random: '随机',
    randomHint: `每次打开随机展示 ${maxSources} 个来源`,
    noSources: '没有匹配的来源。',
    close: '关闭',
  },
  en: {
    title: 'Feed',
    loading: 'Loading stories…',
    unavailable: 'Unavailable right now. It will retry shortly.',
    empty: 'No stories yet.',
    chooseSources: 'Choose sources',
    searchSources: 'Search sources…',
    random: 'Random',
    randomHint: `${maxSources} random sources on each visit`,
    noSources: 'No matching sources.',
    close: 'Close',
  },
}
function stored(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* The choice still holds for this visit. */
  }
}
const t = computed(() => messages[props.language])
const locale = computed(() => (props.language === 'zh' ? 'zh-CN' : 'en-US'))
/** Sources the API offers. The last list seen is kept so columns can appear before it answers. */
const catalog = ref<FeedSource[]>(parseSavedSources(stored('moment-feed-catalog')))
/** Source ids the viewer chose, as saved. None means a random handful. */
const selected = ref<string[]>(parseSavedIds(stored('moment-feed-sources')))
/** Source ids of the columns on screen, in order. */
const shown = ref<string[]>([])
/** Last stories read per source. A failed refresh keeps what is already here. */
const stories = ref<Record<string, FeedArticle[]>>({})
const failed = ref<Record<string, boolean>>({})
const loading = ref(false)
const now = ref(Date.now())
const sourceDialog = ref<HTMLDialogElement>()
const sourceOpen = ref(false)
const sourceQuery = ref('')
let controller: AbortController | undefined
let next: ReturnType<typeof setTimeout> | undefined
let clock: ReturnType<typeof setInterval> | undefined
let loadedAt = 0
let failures = 0
let disposed = false
let catalogLoaded = false
/** The choice the columns on screen were built from; null asks for a new arrangement. */
let applied: string | null = null
/** Random picks that could not be read during this visit and were replaced. */
const dropped = new Set<string>()

/** The viewer's choice limited to sources that exist, in catalog order, and to what fits. */
const picked = computed(() =>
  catalog.value
    .map((source) => source.id)
    .filter((id) => selected.value.includes(id))
    .slice(0, maxSources),
)
const full = computed(() => picked.value.length >= maxSources)
const filteredSources = computed(() => {
  const query = sourceQuery.value.trim().toLowerCase()
  return catalog.value.filter((source) =>
    `${source.id} ${source.name} ${source.nameZh}`.toLowerCase().includes(query),
  )
})
function sourceName(source: FeedSource) {
  return props.language === 'zh' ? source.nameZh : source.name
}
const columns = computed(() =>
  shown.value.map((id) => {
    const source = catalog.value.find((item) => item.id === id)
    return {
      id,
      name: source ? sourceName(source) : id,
      articles: stories.value[id] ?? [],
      failed: failed.value[id] ?? false,
    }
  }),
)
// The chosen sources, or a random handful when none is chosen.
function arrange() {
  shown.value = picked.value.length
    ? picked.value
    : pickRandom(
        catalog.value.map((source) => source.id),
        maxSources,
      )
  applied = picked.value.join()
}
if (catalog.value.length) arrange()

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
  let ok = true
  let reachable = false
  if (!catalogLoaded) {
    try {
      const sources = await loadConfig(api, current.signal)
      // A newer run has taken over, or the page is gone.
      if (disposed || controller !== current) return
      catalog.value = sources
      catalogLoaded = true
      reachable = true
      store('moment-feed-catalog', JSON.stringify(sources))
      // Keep the columns already on screen unless one of them no longer exists.
      const ids = sources.map((source) => source.id)
      if (!shown.value.length || shown.value.some((id) => !ids.includes(id))) arrange()
    } catch {
      // Carry on with the last list seen, if there is one.
      ok = false
    }
  }
  // One request per source: a source that fails or hangs never takes the others with it.
  const ids = [...shown.value]
  const results = await Promise.allSettled(
    ids.map((id) => loadSource(api, id, perSource, current.signal)),
  )
  clearTimeout(timeout)
  if (disposed || controller !== current) return
  let succeeded = 0
  results.forEach((result, index) => {
    const id = ids[index]!
    if (result.status === 'fulfilled') {
      stories.value[id] = result.value
      succeeded++
    } else ok = false
    failed.value[id] = result.status === 'rejected'
  })
  // A random pick that cannot be read gives its place to another source. When nothing
  // at all could be read the API itself is down, and swapping would not help.
  let swapped = false
  if (!picked.value.length && (succeeded || reachable)) {
    const spare = pickRandom(
      catalog.value
        .map((source) => source.id)
        .filter((id) => !shown.value.includes(id) && !dropped.has(id)),
      maxSources,
    )
    shown.value = shown.value.map((id) => {
      if (!failed.value[id] || stories.value[id]?.length || !spare.length) return id
      dropped.add(id)
      swapped = true
      return spare.pop()!
    })
  }
  loading.value = false
  now.value = Date.now()
  if (ok) loadedAt = now.value
  failures = ok ? 0 : failures + 1
  // Retry soon at first, then back off so an API that is down is not hammered.
  next = setTimeout(
    refresh,
    swapped
      ? 0
      : ok
        ? refreshInterval
        : Math.min(retryDelay * 2 ** (failures - 1), refreshInterval),
  )
}
// Drops whatever is under way and reads the columns now on screen.
function restart() {
  controller?.abort()
  loading.value = false
  failures = 0
  void refresh()
}
function catchUp() {
  if (!document.hidden && Date.now() - loadedAt > refreshInterval) void refresh()
}

function openSources() {
  if (sourceDialog.value?.open) return
  sourceQuery.value = ''
  sourceOpen.value = true
  sourceDialog.value?.showModal()
}
function choose(ids: string[]) {
  selected.value = ids
  store('moment-feed-sources', JSON.stringify(ids))
}
function toggleSource(id: string) {
  if (picked.value.includes(id)) choose(picked.value.filter((item) => item !== id))
  else if (!full.value) choose([...picked.value, id])
}
function toggleFirstSource() {
  const first = filteredSources.value[0]
  if (first) toggleSource(first.id)
}
// Choosing "random" is one decision, like choosing a time zone: it closes the dialog
// and always draws a new set.
function selectRandom() {
  choose([])
  applied = null
  sourceDialog.value?.close()
}
// Several sources can be toggled in a row, so the columns change once, on closing.
function sourcesClosed() {
  sourceOpen.value = false
  if (picked.value.join() === applied) return
  dropped.clear()
  arrange()
  restart()
}
defineExpose({ openSources })

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
    <p v-if="!columns.length" class="feed-note" role="status">
      {{ loading ? t.loading : t.unavailable }}
    </p>

    <!-- Same dialog as the time zone one; its styles live in App.vue. -->
    <dialog
      ref="sourceDialog"
      class="zone-dialog"
      aria-labelledby="source-dialog-title"
      @close="sourcesClosed"
      @click="
        (event) => {
          if (event.target === sourceDialog) sourceDialog?.close()
        }
      "
    >
      <div class="dialog-heading">
        <h2 id="source-dialog-title">
          {{ t.chooseSources
          }}<span class="source-count">{{ picked.length }}/{{ maxSources }}</span>
        </h2>
        <button
          type="button"
          class="quiet-button close-button"
          @click="sourceDialog?.close()"
          :aria-label="t.close"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <input
        class="zone-search"
        v-model="sourceQuery"
        type="search"
        :placeholder="t.searchSources"
        :aria-label="t.searchSources"
        autofocus
        @keydown.enter.prevent="toggleFirstSource"
      />
      <div v-if="sourceOpen" class="zone-results">
        <button class="zone-option" :aria-pressed="!picked.length" @click="selectRandom">
          <span
            >{{ t.random }}<small class="source-hint">{{ t.randomHint }}</small></span
          ><span
            ><span class="zone-check">{{ picked.length ? '' : '✓' }}</span></span
          >
        </button>
        <button
          v-for="source in filteredSources"
          :key="source.id"
          class="zone-option"
          :aria-pressed="picked.includes(source.id)"
          :disabled="full && !picked.includes(source.id)"
          @click="toggleSource(source.id)"
        >
          <span translate="no"
            >{{ sourceName(source) }}<small>{{ source.id }}</small></span
          ><span
            ><span class="zone-check">{{ picked.includes(source.id) ? '✓' : '' }}</span></span
          >
        </button>
        <p v-if="!filteredSources.length" role="status">
          {{ catalog.length ? t.noSources : t.unavailable }}
        </p>
      </div>
    </dialog>
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
  /* Chinese and Latin names share one line height so the rules below them line up. */
  line-height: 20px;
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
.feed-note {
  grid-column: 1 / -1;
}
/* How many of the available places are taken. */
.source-count {
  margin-left: 10px;
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}
/* A sentence, unlike the identifiers the other options show here. */
.source-hint {
  font-family: inherit;
}
.feed-source p,
.feed-note {
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
