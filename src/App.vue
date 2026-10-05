<script setup lang="ts">
import { computed, onErrorCaptured, onMounted, onUnmounted, ref, watch } from 'vue'
import FeedView from './components/FeedView.vue'
import { createFullscreenController } from './lib/fullscreen'
import {
  localTimezone,
  timezones,
  timezoneNames,
  isValidTimezone,
  zoneName,
  zoneOffset,
  zoneClockParts,
} from './lib/timezones'

type Theme = 'system' | 'light' | 'dark'
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
    /* Preferences remain available for this session. */
  }
}
const savedLanguage = stored('moment-language')
const language = ref<'zh' | 'en'>(
  savedLanguage === 'zh' || savedLanguage === 'en'
    ? savedLanguage
    : navigator.language.toLowerCase().startsWith('zh')
      ? 'zh'
      : 'en',
)
const messages = {
  zh: {
    brand: '此刻',
    home: '此刻首页',
    currentTime: '当前时间',
    selectTimezone: '选择时区',
    selectSources: '选择来源',
    localTimezone: '本地',
    searchTimezone: '搜索城市或时区…',
    noTimezones: '没有匹配的时区，试试城市英文名或 IANA 时区名称。',
    enterFullscreen: '进入全屏',
    exitFullscreen: '退出全屏',
    fullscreenError: '当前浏览器暂不支持全屏模式。',
    system: '跟随系统',
    light: '浅色模式',
    dark: '深色模式',
    themeSwitch: '，点击切换主题',
    current: '当前',
    close: '关闭',
    language: '切换到英文',
    description:
      '此刻 Moment，一个简单安静的首页。查看时间与日期，顺便看看各个来源的最新资讯，支持时区切换、全屏和明暗主题。',
  },
  en: {
    brand: 'Moment',
    home: 'Moment home',
    currentTime: 'Current time',
    selectTimezone: 'Choose a time zone',
    selectSources: 'Choose sources',
    localTimezone: 'Local',
    searchTimezone: 'Search cities or time zones…',
    noTimezones: 'No matching zones. Try an English city name or an IANA time zone.',
    enterFullscreen: 'Enter fullscreen',
    exitFullscreen: 'Exit fullscreen',
    fullscreenError: 'Fullscreen is unavailable in this browser.',
    system: 'System theme',
    light: 'Light theme',
    dark: 'Dark theme',
    themeSwitch: '. Click to change theme',
    current: 'Current: ',
    close: 'Close',
    language: 'Switch to Chinese',
    description:
      'Moment, a simple, quiet home page. See the time and date with the latest stories from a few sources, switch time zones, and enjoy fullscreen with light and dark themes.',
  },
}
const t = computed(() => messages[language.value])
const locale = computed(() => (language.value === 'zh' ? 'zh-CN' : 'en-US'))
const now = ref(Date.now())
// The feed is optional. If it ever throws while rendering, drop it and keep the clock running.
const feedBroken = ref(false)
const feed = ref<InstanceType<typeof FeedView>>()
onErrorCaptured(() => {
  feedBroken.value = true
  return false
})
const savedTheme = stored('moment-theme')
const theme = ref<Theme>(
  savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system'
    ? savedTheme
    : 'system',
)
const media = window.matchMedia('(prefers-color-scheme: dark)')
const systemDark = ref(media.matches)
const idle = ref(false)
let idleTimeout: ReturnType<typeof setTimeout> | undefined
const fullscreenController = createFullscreenController(document)
const fullscreen = ref(fullscreenController.isActive())
const fullscreenPending = ref(false)
const notice = ref(false)
let noticeTimeout: ReturnType<typeof setTimeout> | undefined
const zoneDialog = ref<HTMLDialogElement>()
const zoneOpen = ref(false)
const savedTimezone = stored('moment-timezone')
const timezonePreference = ref(
  savedTimezone && (savedTimezone === 'local' || isValidTimezone(savedTimezone))
    ? savedTimezone
    : 'local',
)
const timezone = computed(() =>
  timezonePreference.value === 'local' ? localTimezone : timezonePreference.value,
)
const timezoneLabel = computed(() => zoneName(timezone.value, language.value))
const timezoneQuery = ref('')
const filteredZones = computed(() => {
  const query = timezoneQuery.value.trim().toLowerCase().replaceAll('_', ' ')
  return timezones
    .filter((zone) =>
      `${zone.replaceAll('_', ' ')} ${zoneName(zone, 'zh')} ${zoneName(zone, 'en')}`
        .toLowerCase()
        .includes(query),
    )
    .sort(
      (a, b) =>
        Number(b === timezone.value) - Number(a === timezone.value) ||
        Number(Boolean(timezoneNames[b])) - Number(Boolean(timezoneNames[a])) ||
        a.localeCompare(b),
    )
})
function selectTimezone(zone: string) {
  if (zone !== 'local' && !isValidTimezone(zone)) return
  timezonePreference.value = zone
  store('moment-timezone', zone)
  zoneDialog.value?.close()
}
function selectFirstZone() {
  const first = filteredZones.value[0]
  if (first) selectTimezone(first)
}
function openTimezones() {
  timezoneQuery.value = ''
  zoneOpen.value = true
  zoneDialog.value?.showModal()
}
let interval: ReturnType<typeof setInterval>

const isDark = computed(
  () => theme.value === 'dark' || (theme.value === 'system' && systemDark.value),
)
const themeLabel = computed(() => t.value[theme.value])
const clockParts = computed(() => zoneClockParts(timezone.value, now.value))
const displayTime = computed(() => clockParts.value.join(':'))
const dateLabel = computed(() =>
  new Intl.DateTimeFormat(locale.value, {
    timeZone: timezone.value,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now.value),
)
const weekday = computed(() =>
  new Intl.DateTimeFormat(locale.value, { timeZone: timezone.value, weekday: 'long' }).format(
    now.value,
  ),
)
const utcOffset = computed(() => zoneOffset(timezone.value, now.value))
// Fullscreen names the zone only when it differs from the viewer's own.
const foreignZone = computed(() => timezone.value !== localTimezone)
const chromeHidden = computed(() => fullscreen.value && idle.value && !zoneOpen.value)

watch(
  isDark,
  (dark) => {
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#111111' : '#fafafa')
  },
  { immediate: true },
)
watch(
  [displayTime, language],
  () => {
    document.title = `${t.value.brand} · ${displayTime.value}`
  },
  { immediate: true },
)
watch(
  language,
  () => {
    document.documentElement.lang = locale.value
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.value.description)
  },
  { immediate: true },
)
function toggleLanguage() {
  language.value = language.value === 'zh' ? 'en' : 'zh'
  store('moment-language', language.value)
}
function cycleTheme() {
  theme.value = theme.value === 'system' ? 'light' : theme.value === 'light' ? 'dark' : 'system'
  store('moment-theme', theme.value)
}
async function toggleFullscreen() {
  if (fullscreenPending.value) return
  clearTimeout(noticeTimeout)
  notice.value = false
  fullscreenPending.value = true
  try {
    await fullscreenController.toggle()
  } catch {
    notice.value = true
    noticeTimeout = setTimeout(() => {
      notice.value = false
    }, 3000)
  } finally {
    syncFullscreen()
    fullscreenPending.value = false
  }
}
function syncFullscreen() {
  fullscreen.value = fullscreenController.isActive()
}
function syncSystem(event: MediaQueryListEvent) {
  systemDark.value = event.matches
}
// In fullscreen the chrome steps back after a few still seconds.
function wake() {
  idle.value = false
  clearTimeout(idleTimeout)
  idleTimeout = setTimeout(() => {
    idle.value = true
  }, 3000)
}
function keydown(event: KeyboardEvent) {
  wake()
  if (event.repeat || zoneOpen.value) return
  if (event.key === 'Escape' && fullscreenController.isActive()) {
    event.preventDefault()
    void toggleFullscreen()
  }
}
function tick() {
  now.value = Date.now()
}
onMounted(() => {
  media.addEventListener('change', syncSystem)
  for (const type of ['pointermove', 'pointerdown', 'touchstart'] as const)
    document.addEventListener(type, wake, { passive: true })
  wake()
  syncFullscreen()
  document.addEventListener('fullscreenchange', syncFullscreen)
  document.addEventListener('webkitfullscreenchange', syncFullscreen)
  document.addEventListener('visibilitychange', syncFullscreen)
  window.addEventListener('focus', syncFullscreen)
  document.addEventListener('keydown', keydown)
  interval = setInterval(tick, 100)
  tick()
})
onUnmounted(() => {
  clearInterval(interval)
  clearTimeout(noticeTimeout)
  clearTimeout(idleTimeout)
  for (const type of ['pointermove', 'pointerdown', 'touchstart'] as const)
    document.removeEventListener(type, wake)
  media.removeEventListener('change', syncSystem)
  document.removeEventListener('fullscreenchange', syncFullscreen)
  document.removeEventListener('webkitfullscreenchange', syncFullscreen)
  document.removeEventListener('visibilitychange', syncFullscreen)
  window.removeEventListener('focus', syncFullscreen)
  document.removeEventListener('keydown', keydown)
})
</script>

<template>
  <div
    class="page"
    :class="{ dark: isDark, 'is-fullscreen': fullscreen, 'chrome-hidden': chromeHidden }"
  >
    <header class="header">
      <a class="brand" href="./" translate="no" :aria-label="t.home"
        ><span class="brand-mark" aria-hidden="true"></span>{{ t.brand }}</a
      >
      <div class="controls">
        <button
          class="timezone quiet-button"
          @click="openTimezones"
          :aria-label="`${t.selectTimezone}: ${timezoneLabel} ${utcOffset}`"
          :title="t.selectTimezone"
        >
          <span class="timezone-name">{{ timezoneLabel }}</span>
          <span class="offset">{{ utcOffset }}</span>
        </button>
        <button
          v-if="!fullscreen && !feedBroken"
          class="quiet-button icon-button"
          @click="feed?.openSources()"
          :aria-label="t.selectSources"
          :title="t.selectSources"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
        </button>
        <button
          class="quiet-button icon-button"
          @click="toggleLanguage"
          :aria-label="t.language"
          :title="t.language"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <ellipse cx="12" cy="12" rx="4" ry="9" />
            <path d="M3 12h18" />
          </svg>
        </button>
        <button
          class="quiet-button icon-button"
          @click="cycleTheme"
          :aria-label="`${t.current}${themeLabel}${t.themeSwitch}`"
          :title="`${t.current}${themeLabel}${t.themeSwitch}`"
        >
          <svg v-if="theme === 'system'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="4" width="18" height="13" rx="2" />
            <path d="M8 21h8m-4-4v4" /></svg
          ><svg v-else-if="theme === 'light'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"
            /></svg
          ><svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z" />
          </svg>
        </button>
        <button
          class="quiet-button icon-button"
          :disabled="fullscreenPending"
          :aria-busy="fullscreenPending"
          @click="toggleFullscreen"
          :aria-label="fullscreen ? t.exitFullscreen : t.enterFullscreen"
          :title="fullscreen ? t.exitFullscreen : t.enterFullscreen"
        >
          <svg v-if="!fullscreen" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 8h4V4m8 0v4h4M8 20v-4H4m16 0h-4v4" />
          </svg>
        </button>
      </div>
    </header>

    <main class="main">
      <div class="clock-surface">
        <h1 class="time-display" :aria-label="`${t.currentTime} ${displayTime}`">
          <span class="time-part">{{ clockParts[0] }}</span
          ><span class="colon" aria-hidden="true">:</span
          ><span class="time-part">{{ clockParts[1] }}</span
          ><span v-if="fullscreen" class="colon" aria-hidden="true">:</span
          ><span class="seconds">{{ clockParts[2] }}</span>
        </h1>
        <div class="date-line">
          <span>{{ dateLabel }}</span
          ><span class="date-divider"></span><span>{{ weekday }}</span>
        </div>
        <div v-if="fullscreen && foreignZone" class="zone-line">
          {{ timezoneLabel }} · <span class="mono">{{ utcOffset }}</span>
        </div>
        <p v-if="notice" class="notice" role="status">{{ t.fullscreenError }}</p>
      </div>
      <FeedView
        v-if="!feedBroken"
        v-show="!fullscreen"
        ref="feed"
        :language="language"
        :timezone="timezone"
      />
    </main>

    <dialog
      ref="zoneDialog"
      class="zone-dialog"
      aria-labelledby="zone-dialog-title"
      @close="zoneOpen = false"
      @click="
        (event) => {
          if (event.target === zoneDialog) zoneDialog?.close()
        }
      "
    >
      <div class="dialog-heading">
        <h2 id="zone-dialog-title">{{ t.selectTimezone }}</h2>
        <button
          type="button"
          class="quiet-button close-button"
          @click="zoneDialog?.close()"
          :aria-label="t.close"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <input
        class="zone-search"
        v-model="timezoneQuery"
        type="search"
        :placeholder="t.searchTimezone"
        :aria-label="t.searchTimezone"
        autofocus
        @keydown.enter.prevent="selectFirstZone"
      />
      <div v-if="zoneOpen" class="zone-results">
        <button
          class="zone-option"
          :aria-pressed="timezonePreference === 'local'"
          @click="selectTimezone('local')"
        >
          <span
            >{{ t.localTimezone }}<small>{{ localTimezone }}</small></span
          ><span
            ><span class="mono">{{ zoneOffset(localTimezone, now) }}</span
            ><span class="zone-check">{{ timezonePreference === 'local' ? '✓' : '' }}</span></span
          >
        </button>
        <button
          v-for="zone in filteredZones"
          :key="zone"
          class="zone-option"
          :aria-pressed="timezonePreference === zone"
          @click="selectTimezone(zone)"
        >
          <span
            >{{ zoneName(zone, language) }}<small>{{ zone }}</small></span
          ><span
            ><span class="mono">{{ zoneOffset(zone, now) }}</span
            ><span class="zone-check">{{ timezonePreference === zone ? '✓' : '' }}</span></span
          >
        </button>
        <p v-if="!filteredZones.length" role="status">{{ t.noTimezones }}</p>
      </div>
    </dialog>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}
body {
  margin: 0;
}
button,
input {
  font: inherit;
}
button,
a {
  -webkit-tap-highlight-color: transparent;
}
button {
  cursor: pointer;
  touch-action: manipulation;
}
button:disabled {
  cursor: default;
  opacity: 0.4;
}
button:focus-visible,
a:focus-visible,
input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.page {
  --bg: #fafafa;
  --ink: #262626;
  --muted: #666666;
  --line: #ebebeb;
  --hover: #f2f2f2;
  --active: #ebebeb;
  --divider: #a1a1a1;
  --accent: #555555;
  --mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  min-height: 100svh;
  background: var(--bg);
  color: var(--ink);
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    'PingFang SC',
    'Microsoft YaHei',
    sans-serif;
  display: flex;
  flex-direction: column;
  padding: 0 48px;
  transition:
    background-color 0.2s,
    color 0.2s;
}
.page.dark {
  --bg: #111111;
  --ink: #d4d4d4;
  --muted: #8f8f8f;
  --line: #2e2e2e;
  --hover: #1a1a1a;
  --active: #242424;
  --divider: #666666;
  --accent: #a3a3a3;
}
.header {
  height: 88px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
  transition: opacity 0.4s;
}
.chrome-hidden {
  cursor: none;
}
.chrome-hidden .header:not(:has(:focus-visible)) {
  opacity: 0;
  pointer-events: none;
}
.brand {
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ink);
  font-size: 18px;
  font-weight: 600;
  flex-shrink: 0;
}
.brand-mark {
  width: 20px;
  height: 20px;
  border: 1.7px solid currentColor;
  border-radius: 50%;
  position: relative;
}
.brand-mark::after {
  content: '';
  position: absolute;
  width: 5px;
  height: 6px;
  border-left: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  left: 8px;
  top: 3px;
}
.controls {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  margin-right: -10px;
}
.quiet-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  border-radius: 6px;
}
.quiet-button:hover {
  color: var(--ink);
  background: var(--hover);
}
.quiet-button:active {
  color: var(--ink);
  background: var(--active);
}
.mono {
  font-family: var(--mono);
}
.icon-button {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
}
.timezone {
  gap: 10px;
  height: 38px;
  padding: 0 12px;
  min-width: 0;
}
.timezone-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.offset {
  font-family: var(--mono);
  font-size: 12px;
  white-space: nowrap;
}
svg {
  height: 17px;
  width: 17px;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.is-fullscreen .main {
  justify-content: center;
  padding-bottom: 88px;
}
.clock-surface {
  text-align: center;
  padding: 64px 0 80px;
}
.is-fullscreen .brand {
  visibility: hidden;
}
.is-fullscreen .clock-surface {
  /* Three equal segments must fit both the width and the height. */
  --clock: clamp(64px, min(19vw, 45svh), 480px);
  padding: 0;
}
.time-display {
  margin: 0 auto;
  display: flex;
  align-items: baseline;
  justify-content: center;
  font-size: clamp(56px, 11.7vw, 168px);
  line-height: 1.12;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.06em;
  user-select: none;
  white-space: nowrap;
}
.is-fullscreen .time-display {
  font-size: var(--clock);
  line-height: 1.05;
}
.time-part {
  width: 1.28em;
  text-align: center;
}
.colon {
  width: 0.34em;
  position: relative;
  top: -0.055em;
  text-align: center;
}
/* Hangs off the minutes on the shared baseline, so hours:minutes stay centred. */
.seconds {
  width: 0;
  overflow: visible;
  white-space: nowrap;
  font-size: 0.22em;
  color: var(--muted);
  letter-spacing: 0;
  text-indent: 0.25em;
}
.is-fullscreen .seconds {
  width: 1.28em;
  font-size: 1em;
  color: inherit;
  letter-spacing: inherit;
  text-indent: 0;
  text-align: center;
}
.date-line {
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  font-size: 18px;
  line-height: 26px;
  font-variant-numeric: tabular-nums;
  margin-top: 26px;
}
.date-divider {
  height: 16px;
  width: 1px;
  background: var(--divider);
}
.is-fullscreen .date-line {
  font-size: max(16px, calc(var(--clock) / 8));
  line-height: 1.33;
  gap: 1em;
  margin-top: calc(var(--clock) * 0.15);
}
.is-fullscreen .date-divider {
  height: 0.85em;
}
.zone-line {
  color: var(--muted);
  font-size: 16px;
  margin-top: 14px;
}
.notice {
  color: var(--muted);
  font-size: 13px;
  margin: 24px 0 0;
}
.zone-dialog {
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--ink);
  border-radius: 16px;
  width: min(440px, calc(100% - 32px));
  padding: 24px;
  box-shadow:
    0 1px 2px #0000000f,
    0 24px 64px #00000024;
}
.zone-dialog::backdrop {
  background: #00000045;
  backdrop-filter: blur(5px);
}
.dialog-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dialog-heading h2 {
  font-size: 20px;
  margin: 0;
  font-weight: 600;
}
.close-button {
  width: 32px;
  height: 32px;
}
.zone-search {
  width: 100%;
  margin: 22px 0 14px;
  padding: 12px 14px;
  font-size: 14px;
  background: var(--hover);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.zone-search::placeholder {
  color: var(--muted);
}
.zone-results {
  max-height: min(400px, 48svh);
  overflow: hidden auto;
  overscroll-behavior: contain;
}
.zone-option {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: transparent;
  color: var(--ink);
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 10px;
  text-align: left;
  font-size: 13px;
}
.zone-option:hover {
  background: var(--hover);
}
.zone-option:active,
.zone-option[aria-pressed='true'] {
  background: var(--active);
}
.zone-option[aria-pressed='true'] {
  font-weight: 500;
}
.zone-option:focus-visible {
  outline-offset: -2px;
}
.zone-option small {
  display: block;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 400;
  margin-top: 4px;
}
.zone-option > span:last-child {
  display: flex;
  align-items: center;
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
  white-space: nowrap;
}
.zone-check {
  display: inline-block;
  width: 20px;
  margin-left: 10px;
  color: var(--ink);
}
.zone-results p {
  padding: 10px;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.7;
}
@media (min-width: 1600px) {
  .page {
    padding: 0 64px;
  }
}
@media (max-width: 700px) {
  .page {
    padding: 0 20px;
  }
  .header {
    height: 68px;
  }
  .controls {
    gap: 0;
    margin-right: -12px;
  }
  .icon-button {
    width: 44px;
    height: 44px;
  }
  .timezone {
    height: 44px;
    padding: 0 8px;
  }
  .offset {
    display: none;
  }
  .clock-surface {
    padding: 32px 0 48px;
  }
  .time-display {
    font-size: 17vw;
  }
  .date-line {
    font-size: 14px;
    line-height: 20px;
    gap: 14px;
    margin-top: 18px;
  }
  .date-divider {
    height: 13px;
  }
  .is-fullscreen .main {
    padding-bottom: 68px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .page,
  .header {
    transition: none;
  }
}
</style>
