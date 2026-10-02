<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
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
const language = ref<'zh' | 'en'>(navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en')
const messages = {
  zh: {
    brand: '此刻',
    home: '此刻首页',
    clock: '时钟',
    timer: '倒计时',
    modes: '时钟模式',
    currentTime: '当前时间',
    selectTimezone: '选择时区',
    localTimezone: '本地',
    searchTimezone: '搜索城市或时区',
    noTimezones: '没有匹配的时区，试试城市英文名或 IANA 时区名称。',
    remainingTime: '剩余时间',
    running: '运行中',
    timeUp: '时间到了',
    paused: '已暂停，随时继续',
    fullscreen: '全屏',
    enterFullscreen: '进入全屏',
    exitFullscreen: '退出全屏',
    fullscreenError: '当前浏览器暂不支持全屏模式。',
    system: '跟随系统',
    light: '浅色模式',
    dark: '深色模式',
    themeSwitch: '，点击切换主题',
    current: '当前',
    duration: '倒计时时长',
    minuteUnit: '分钟',
    custom: '自定义',
    reset: '重置倒计时',
    pause: '暂停',
    again: '再来一次',
    resume: '继续',
    start: '开始计时',
    soundOff: '关闭结束提示音',
    soundOn: '开启结束提示音',
    soundEnabled: '提示音已开启',
    soundDisabled: '提示音已关闭',
    setTimer: '设置倒计时',
    close: '关闭',
    customHint: '为接下来的事情，留出一点时间。',
    hours: '小时',
    minutes: '分钟',
    seconds: '秒',
    confirm: '确定',
    invalidDuration: '请输入有效时长：小时 0–99，分钟和秒 0–59。',
    zeroDuration: '时长需要大于 0 秒。',
    language: '切换到英文',
    description: '此刻，一个简单安静的时钟。查看本地时间与日期，使用倒计时，支持全屏和明暗主题。',
  },
  en: {
    brand: 'Moment',
    home: 'Moment home',
    clock: 'Clock',
    timer: 'Timer',
    modes: 'Clock mode',
    currentTime: 'Current time',
    selectTimezone: 'Choose a time zone',
    localTimezone: 'Local',
    searchTimezone: 'Search cities or time zones',
    noTimezones: 'No matching zones. Try an English city name or an IANA time zone.',
    remainingTime: 'Time remaining',
    running: 'Running',
    timeUp: 'Time’s up',
    paused: 'Paused. Take your time.',
    fullscreen: 'Fullscreen',
    enterFullscreen: 'Enter fullscreen',
    exitFullscreen: 'Exit fullscreen',
    fullscreenError: 'Fullscreen is unavailable in this browser.',
    system: 'System theme',
    light: 'Light theme',
    dark: 'Dark theme',
    themeSwitch: '. Click to change theme',
    current: 'Current: ',
    duration: 'Timer duration',
    minuteUnit: 'min',
    custom: 'Custom',
    reset: 'Reset timer',
    pause: 'Pause',
    again: 'Start again',
    resume: 'Resume',
    start: 'Start timer',
    soundOff: 'Turn completion sound off',
    soundOn: 'Turn completion sound on',
    soundEnabled: 'Sound is on',
    soundDisabled: 'Sound is off',
    setTimer: 'Set a timer',
    close: 'Close',
    customHint: 'A little time for what comes next.',
    hours: 'Hours',
    minutes: 'Minutes',
    seconds: 'Seconds',
    confirm: 'Set timer',
    invalidDuration: 'Enter whole numbers: hours 0–99, minutes and seconds 0–59.',
    zeroDuration: 'Choose a duration longer than 0 seconds.',
    language: 'Switch to Chinese',
    description:
      'Moment, a simple, quiet clock. View local time and date, set a timer, and enjoy fullscreen with light and dark themes.',
  },
}
const t = computed(() => messages[language.value])
const locale = computed(() => (language.value === 'zh' ? 'zh-CN' : 'en-US'))
const view = ref<'clock' | 'timer'>('clock')
const now = ref(Date.now())
const theme = ref<Theme>('system')
const systemDark = ref(false)
const fullscreenController = createFullscreenController(document)
const fullscreen = ref(fullscreenController.isActive())
const fullscreenPending = ref(false)
const notice = ref(false)
let noticeTimeout: ReturnType<typeof setTimeout> | undefined
const duration = ref(25 * 60 * 1000)
const remaining = ref(duration.value)
const running = ref(false)
const finished = ref(false)
const sound = ref(true)
const customOpen = ref(false)
const hours = ref(0)
const minutes = ref(25)
const seconds = ref(0)
const formError = ref<'invalidDuration' | 'zeroDuration' | ''>('')
const customDialog = ref<HTMLDialogElement>()
const zoneDialog = ref<HTMLDialogElement>()
const zoneOpen = ref(false)
const timezonePreference = ref('local')
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
const offsetTimestamp = computed(() => Math.floor(now.value / 60000) * 60000)
const zoneRows = computed(() =>
  filteredZones.value.map((zone) => ({ zone, offset: zoneOffset(zone, offsetTimestamp.value) })),
)
function selectTimezone(zone: string) {
  if (zone !== 'local' && !isValidTimezone(zone)) return
  timezonePreference.value = zone
  try {
    localStorage.setItem('moment-timezone', zone)
  } catch {
    /* Keep session preference. */
  }
  zoneDialog.value?.close()
}
function openTimezones() {
  timezoneQuery.value = ''
  zoneOpen.value = true
  zoneDialog.value?.showModal()
}
let deadline = 0
let interval: ReturnType<typeof setInterval>
let audioContext: AudioContext | undefined
let media: MediaQueryList

const isDark = computed(
  () => theme.value === 'dark' || (theme.value === 'system' && systemDark.value),
)
const themeLabel = computed(() => t.value[theme.value])
const clockParts = computed(() => zoneClockParts(timezone.value, now.value))
const timerParts = computed(() => {
  const total = Math.ceil(remaining.value / 1000)
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map((part) =>
    String(part).padStart(2, '0'),
  )
})
const displayParts = computed(() => (view.value === 'clock' ? clockParts.value : timerParts.value))
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
const timerStatus = computed(() =>
  finished.value
    ? t.value.timeUp
    : !running.value && remaining.value < duration.value
      ? t.value.paused
      : '',
)
const progress = computed(() =>
  view.value === 'clock'
    ? new Date(now.value).getSeconds() / 60
    : 1 - remaining.value / duration.value,
)
const selectedPreset = computed(() => duration.value / 60000)
const displayTime = computed(() => displayParts.value.join(':'))

watch(isDark, (dark) => {
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
})
watch(
  [displayTime, view, finished, language],
  () => {
    document.title = `${t.value.brand} · ${finished.value ? t.value.timeUp : displayTime.value}`
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
  try {
    localStorage.setItem('moment-language', language.value)
  } catch {
    /* Keep the current session language. */
  }
}

function cycleTheme() {
  theme.value = theme.value === 'system' ? 'light' : theme.value === 'light' ? 'dark' : 'system'
  try {
    localStorage.setItem('moment-theme', theme.value)
  } catch {
    /* Preferences remain available for this session. */
  }
}
function setDuration(value: number) {
  duration.value = value
  remaining.value = value
  running.value = false
  finished.value = false
}
function prepareAudio() {
  if (!sound.value) return
  try {
    audioContext ??= new AudioContext()
    void audioContext.resume().catch(() => {})
  } catch {
    /* Visual completion is always available. */
  }
}
function toggleSound() {
  sound.value = !sound.value
  prepareAudio()
}
function ring() {
  if (!sound.value || !audioContext || audioContext.state !== 'running') return
  for (let index = 0; index < 3; index++) {
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const start = audioContext.currentTime + index * 0.4
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.12, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3)
    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start(start)
    oscillator.stop(start + 0.32)
  }
}
function toggleTimer() {
  if (running.value) {
    remaining.value = Math.max(0, deadline - Date.now())
    running.value = false
    if (remaining.value === 0) {
      finished.value = true
      ring()
    }
  } else {
    if (finished.value) remaining.value = duration.value
    finished.value = false
    prepareAudio()
    deadline = Date.now() + remaining.value
    running.value = true
  }
}
function resetTimer() {
  setDuration(duration.value)
}
function openCustom() {
  hours.value = Math.floor(duration.value / 3600000)
  minutes.value = Math.floor(duration.value / 60000) % 60
  seconds.value = Math.floor(duration.value / 1000) % 60
  formError.value = ''
  customOpen.value = true
  customDialog.value?.showModal()
}
function closeCustom() {
  customDialog.value?.close()
  customOpen.value = false
}
function saveCustom() {
  const values = [Number(hours.value), Number(minutes.value), Number(seconds.value)]
  if (
    values.some((value) => !Number.isFinite(value) || !Number.isInteger(value) || value < 0) ||
    values[0]! > 99 ||
    values[1]! > 59 ||
    values[2]! > 59
  ) {
    formError.value = 'invalidDuration'
    return
  }
  const total = values[0]! * 3600 + values[1]! * 60 + values[2]!
  if (total <= 0) {
    formError.value = 'zeroDuration'
    return
  }
  setDuration(total * 1000)
  closeCustom()
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
function keydown(event: KeyboardEvent) {
  if (event.repeat) return
  if (
    event.key === 'Escape' &&
    fullscreenController.isActive() &&
    !customOpen.value &&
    !zoneOpen.value
  ) {
    event.preventDefault()
    void toggleFullscreen()
    return
  }
  if (
    event.target instanceof HTMLElement &&
    (event.target.closest('input, textarea, select') || event.target.isContentEditable)
  )
    return
  if (
    event.key.toLowerCase() === 'f' &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !customOpen.value &&
    !zoneOpen.value
  ) {
    event.preventDefault()
    void toggleFullscreen()
  }
}
function tick() {
  now.value = Date.now()
  if (running.value) {
    remaining.value = Math.max(0, deadline - now.value)
    if (remaining.value === 0) {
      running.value = false
      finished.value = true
      ring()
    }
  }
}
onMounted(() => {
  media = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = media.matches
  try {
    const savedTimezone = localStorage.getItem('moment-timezone')
    if (savedTimezone && (savedTimezone === 'local' || isValidTimezone(savedTimezone)))
      timezonePreference.value = savedTimezone
    const savedLanguage = localStorage.getItem('moment-language')
    if (savedLanguage === 'zh' || savedLanguage === 'en') language.value = savedLanguage
    const saved = localStorage.getItem('moment-theme')
    if (saved === 'system' || saved === 'light' || saved === 'dark') theme.value = saved
  } catch {
    /* Use the system theme when storage is unavailable. */
  }
  document.documentElement.style.colorScheme = isDark.value ? 'dark' : 'light'
  media.addEventListener('change', syncSystem)
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
  media?.removeEventListener('change', syncSystem)
  document.removeEventListener('fullscreenchange', syncFullscreen)
  document.removeEventListener('webkitfullscreenchange', syncFullscreen)
  document.removeEventListener('visibilitychange', syncFullscreen)
  window.removeEventListener('focus', syncFullscreen)
  document.removeEventListener('keydown', keydown)
  void audioContext?.close()
})
</script>

<template>
  <div class="page" :class="{ dark: isDark, 'is-fullscreen': fullscreen }">
    <header class="header">
      <a class="brand" href="./" :aria-label="t.home"
        ><span class="brand-mark" aria-hidden="true"></span>{{ t.brand }}</a
      >
      <nav class="tabs" :aria-label="t.modes">
        <button
          :class="{ active: view === 'clock' }"
          :aria-pressed="view === 'clock'"
          @click="view = 'clock'"
        >
          {{ t.clock }}
        </button>
        <button
          :class="{ active: view === 'timer' }"
          :aria-pressed="view === 'timer'"
          @click="view = 'timer'"
        >
          {{ t.timer }}<span v-if="running" class="running-dot" :aria-label="t.running"></span>
        </button>
      </nav>
      <button
        class="fullscreen-button quiet-button"
        :disabled="fullscreenPending"
        :aria-busy="fullscreenPending"
        @click="toggleFullscreen"
        :aria-label="fullscreen ? t.exitFullscreen : t.enterFullscreen"
        :title="`${fullscreen ? t.exitFullscreen : t.enterFullscreen} (F)`"
      >
        <svg v-if="!fullscreen" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 8h4V4m8 0v4h4M8 20v-4H4m16 0h-4v4" />
        </svg>
        <span>{{ fullscreen ? t.exitFullscreen : t.fullscreen }}</span>
      </button>
    </header>

    <main class="main">
      <div class="clock-surface">
        <h1
          class="time-display"
          :class="{ completed: view === 'timer' && finished }"
          :aria-label="`${view === 'clock' ? t.currentTime : t.remainingTime} ${displayTime}`"
        >
          <template v-for="(part, index) in displayParts" :key="index"
            ><span class="time-part">{{ part }}</span
            ><span v-if="index < 2" class="colon" aria-hidden="true">:</span></template
          >
        </h1>
        <div v-if="view === 'clock'" class="date-line">
          <span>{{ dateLabel }}</span
          ><span class="date-divider"></span><span>{{ weekday }}</span>
        </div>
        <p v-else class="timer-status" role="status">{{ timerStatus }}</p>

        <div class="secondary-space">
          <div class="minute-track" aria-hidden="true">
            <div class="track-line"><span :style="{ width: `${progress * 100}%` }"></span></div>
            <div class="track-ticks"><span v-for="tickIndex in 13" :key="tickIndex"></span></div>
          </div>
          <template v-if="view === 'timer'">
            <div class="presets" :aria-label="t.duration">
              <button
                v-for="preset in [5, 15, 25, 60]"
                :key="preset"
                :class="{ selected: selectedPreset === preset }"
                :disabled="running"
                :aria-pressed="selectedPreset === preset"
                @click="setDuration(preset * 60000)"
              >
                {{ preset }} {{ t.minuteUnit }}
              </button>
              <button
                :disabled="running"
                :class="{ selected: ![5, 15, 25, 60].includes(selectedPreset) }"
                @click="openCustom"
              >
                {{ t.custom
                }}<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="m6 4 4 4-4 4" />
                </svg>
              </button>
            </div>
            <div class="timer-actions">
              <button
                class="reset-button quiet-button"
                @click="resetTimer"
                :aria-label="t.reset"
                :title="t.reset"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" />
                </svg>
              </button>
              <button class="primary-button" @click="toggleTimer">
                <svg v-if="running" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M6 4h3v12H6zm5 0h3v12h-3z" /></svg
                ><svg v-else viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6z" /></svg
                >{{
                  running ? t.pause : finished ? t.again : remaining < duration ? t.resume : t.start
                }}
              </button>
              <button
                class="quiet-button sound-button"
                :aria-pressed="sound"
                :aria-label="sound ? t.soundOff : t.soundOn"
                :title="sound ? t.soundEnabled : t.soundDisabled"
                @click="toggleSound"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m12 4-6 5H3v6h3l6 5V4Z" />
                  <path v-if="sound" d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
                  <path v-else d="m16 9 6 6m0-6-6 6" />
                </svg>
              </button>
            </div>
          </template>
        </div>
      </div>
      <p v-if="notice" class="notice" role="status">{{ t.fullscreenError }}</p>
    </main>

    <footer class="footer">
      <button
        class="timezone quiet-button"
        @click="openTimezones"
        :aria-label="`${t.selectTimezone}: ${timezoneLabel} ${utcOffset}`"
        :title="t.selectTimezone"
      >
        <span class="timezone-icon" aria-hidden="true">◷</span>
        <span class="timezone-details">
          <span class="timezone-name">{{ timezoneLabel }}</span>
          <span class="offset">{{ utcOffset }}</span>
        </span>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
      </button>
      <div class="footer-right">
        <button
          class="language-button quiet-button"
          @click="toggleLanguage"
          :aria-label="t.language"
          :title="t.language"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <ellipse cx="12" cy="12" rx="4" ry="9" />
            <path d="M3 12h18" /></svg
          ><span>{{ language === 'zh' ? '中文' : 'English' }}</span></button
        ><button
          class="theme-button quiet-button"
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
            <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z" /></svg
          ><span>{{ themeLabel }}</span>
        </button>
      </div>
    </footer>

    <dialog
      ref="zoneDialog"
      class="custom-dialog zone-dialog"
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
          ×
        </button>
      </div>
      <input
        class="zone-search"
        v-model="timezoneQuery"
        type="search"
        :placeholder="t.searchTimezone"
        :aria-label="t.searchTimezone"
        autofocus
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
            >{{ zoneOffset(localTimezone, now)
            }}<span class="zone-check">{{ timezonePreference === 'local' ? '✓' : '' }}</span></span
          >
        </button>
        <button
          v-for="{ zone, offset } in zoneRows"
          :key="zone"
          class="zone-option"
          :aria-pressed="timezonePreference === zone"
          @click="selectTimezone(zone)"
        >
          <span
            >{{ zoneName(zone, language) }}<small>{{ zone }}</small></span
          ><span
            >{{ zoneOffset(zone, now)
            }}<span class="zone-check">{{ timezonePreference === zone ? '✓' : '' }}</span></span
          >
        </button>
        <p v-if="!filteredZones.length" role="status">{{ t.noTimezones }}</p>
      </div>
    </dialog>

    <dialog
      ref="customDialog"
      class="custom-dialog"
      aria-labelledby="timer-dialog-title"
      @close="customOpen = false"
      @click="
        (event) => {
          if (event.target === customDialog) closeCustom()
        }
      "
    >
      <form novalidate @submit.prevent="saveCustom">
        <div class="dialog-heading">
          <h2 id="timer-dialog-title">{{ t.setTimer }}</h2>
          <button
            type="button"
            class="quiet-button close-button"
            @click="closeCustom"
            :aria-label="t.close"
          >
            ×
          </button>
        </div>
        <p>{{ t.customHint }}</p>
        <div class="duration-inputs">
          <label
            ><input v-model="hours" type="number" min="0" max="99" required autofocus />{{
              t.hours
            }}</label
          ><span>:</span
          ><label
            ><input v-model="minutes" type="number" min="0" max="59" required />{{
              t.minutes
            }}</label
          ><span>:</span
          ><label
            ><input v-model="seconds" type="number" min="0" max="59" required />{{
              t.seconds
            }}</label
          >
        </div>
        <p v-if="formError" class="form-error" role="alert">{{ t[formError] }}</p>
        <button class="primary-button dialog-submit" type="submit">{{ t.confirm }}</button>
      </form>
    </dialog>
  </div>
</template>

<style>
@font-face {
  font-family: 'Geist';
  src: url('/fonts/geist-sans.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
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
}
button:disabled {
  cursor: default;
  opacity: 0.4;
}
button:focus-visible,
a:focus-visible,
input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 5px;
}
.page {
  --bg: #fafafa;
  --ink: #333333;
  --muted: #666666;
  --faint: #999999;
  --tick: #c2c2c2;
  --line: #e6e6e6;
  --surface: #f2f2f2;
  --accent: #555555;
  --selected: #ebebeb;
  min-height: 100svh;
  background: var(--bg);
  color: var(--ink);
  font-family:
    'Geist',
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
  --ink: #b5b5b5;
  --muted: #969696;
  --faint: #737373;
  --tick: #484848;
  --line: #292929;
  --surface: #191919;
  --accent: #a3a3a3;
  --selected: #242424;
}
.header {
  height: 112px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  flex-shrink: 0;
}
.brand {
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ink);
  width: fit-content;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: 1px;
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
.tabs {
  display: flex;
  padding: 4px;
  border-radius: 10px;
  background: var(--surface);
  gap: 3px;
}
.tabs button {
  flex-shrink: 0;
  white-space: nowrap;
  background: transparent;
  border: 0;
  border-radius: 7px;
  height: 36px;
  padding: 0 26px;
  color: var(--muted);
  font-size: 13px;
  position: relative;
}
.tabs button.active {
  background: var(--bg);
  color: var(--ink);
  box-shadow: 0 1px 4px #0000000a;
}
.running-dot {
  position: absolute;
  right: 12px;
  top: 15px;
  height: 5px;
  width: 5px;
  border-radius: 50%;
  background: var(--accent);
}
.quiet-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  padding: 9px;
  border-radius: 6px;
}
.quiet-button:hover {
  color: var(--ink);
  background: var(--surface);
}
svg {
  height: 19px;
  width: 19px;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}
.fullscreen-button {
  justify-self: end;
}
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 40px 0 34px;
}
.clock-surface {
  width: 100%;
  text-align: center;
  margin-top: -20px;
}

.time-display {
  margin: 0 auto;
  display: flex;
  align-items: baseline;
  justify-content: center;
  font-size: clamp(64px, 15.6vw, 240px);
  line-height: 1.12;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.06em;
  user-select: none;
  white-space: nowrap;
}
.time-part {
  width: 1.28em;
  text-align: center;
}
.colon {
  width: 0.34em;
  position: relative;
  top: -0.055em;
  font-weight: 400;
  text-align: center;
}
.completed {
  color: var(--accent);
}
.date-line {
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 19px;
  font-size: 14px;
  min-height: 20px;
  line-height: 20px;
  letter-spacing: 0.3px;
  margin-top: 26px;
}
.date-divider {
  height: 13px;
  width: 1px;
  background: var(--faint);
}
.timer-status {
  min-height: 20px;
  line-height: 20px;
  color: var(--muted);
  font-size: 14px;
  letter-spacing: 0.3px;
  margin: 26px 0 0;
}
.secondary-space {
  height: 225px;
  padding-top: 44px;
}
.minute-track {
  width: 240px;
  margin: 0 auto;
  padding-top: 0;
  margin-bottom: 28px;
}
.track-line {
  background: var(--line);
  height: 2px;
}
.track-line > span {
  background: var(--faint);
  height: 2px;
  display: block;
}
.track-ticks {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
}
.track-ticks span {
  width: 2px;
  height: 5px;
  border-radius: 1px;
  background: var(--tick);
}
.track-ticks span:nth-child(3n + 1) {
  height: 9px;
}
.presets {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}
.presets button {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  padding: 9px 15px;
  font-size: 12px;
  display: flex;
  gap: 5px;
  align-items: center;
}
.presets button:hover:not(:disabled),
.presets button.selected {
  background: var(--selected);
  border-color: var(--faint);
  color: var(--ink);
}
.presets svg {
  width: 12px;
  height: 12px;
}
.timer-actions {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-top: 22px;
  min-height: 46px;
}
.primary-button {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: 8px;
  background: var(--selected);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--line);
  padding: 14px 32px;
  min-width: 160px;
  font-size: 14px;
  font-weight: 500;
}
.primary-button:hover {
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--faint);
}
.primary-button svg {
  fill: currentColor;
  stroke: none;
  width: 17px;
  height: 17px;
}
.timer-actions .quiet-button {
  width: 38px;
  height: 38px;
}
.notice {
  position: absolute;
  bottom: 0;
  color: var(--muted);
  font-size: 13px;
}
.footer {
  height: 83px;
  border-top: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--muted);
  font-size: 12px;
  flex-shrink: 0;
}
.timezone,
.footer-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.timezone-details {
  display: flex;
  align-items: center;
  gap: 10px;
}
.timezone {
  padding-left: 0;
  font-size: 12px;
}
.timezone svg {
  width: 12px;
  height: 12px;
}
.timezone-icon {
  font-size: 19px;
}
.offset {
  margin-left: 7px;
  color: var(--muted);
}
.footer-right {
  gap: 12px;
}

.theme-button,
.language-button {
  font-size: 12px;
}
.theme-button svg,
.language-button svg {
  height: 16px;
  width: 16px;
}
.custom-dialog {
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--ink);
  border-radius: 16px;
  width: min(440px, calc(100% - 32px));
  padding: 28px;
  box-shadow: 0 24px 100px #00000025;
}
.custom-dialog::backdrop {
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
  font-size: 26px;
  width: 32px;
  height: 32px;
}
.custom-dialog p {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.7;
}
.duration-inputs {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 28px 0;
}
.duration-inputs label {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 12px;
  color: var(--muted);
}
.duration-inputs input {
  display: block;
  width: 100%;
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 8px;
  text-align: center;
  font-size: 28px;
  padding: 14px 4px;
  margin-bottom: 10px;
  font-variant-numeric: tabular-nums;
}
.duration-inputs > span {
  padding-top: 17px;
  color: var(--muted);
}
.dialog-submit {
  width: 100%;
}
.custom-dialog .form-error {
  color: #c95555;
}
.zone-dialog {
  padding: 24px;
}
.zone-search {
  width: 100%;
  margin: 22px 0 14px;
  padding: 12px 14px;
  font: inherit;
  font-size: 14px;
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.zone-search::placeholder {
  color: var(--muted);
}
.zone-results {
  max-height: min(400px, 48svh);
  overflow-y: auto;
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
.zone-option:hover,
.zone-option[aria-pressed='true'] {
  background: var(--selected);
}
.zone-option small {
  display: block;
  color: var(--muted);
  font-size: 11px;
  margin-top: 4px;
}
.zone-option > span:last-child {
  display: flex;
  align-items: center;
  color: var(--muted);
  font-size: 12px;
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
}
@media (min-width: 1600px) {
  .page {
    padding: 0 64px;
  }
  .secondary-space {
    padding-top: 60px;
  }
}
@media (max-width: 700px) {
  .page {
    padding: 0 24px;
  }
  .header {
    height: 100px;
    grid-template-columns: 1fr auto;
    position: relative;
    align-items: start;
    padding-top: 26px;
  }
  .brand {
    font-size: 17px;
  }
  .tabs {
    width: max-content;
    position: absolute;
    top: 98px;
    left: 50%;
    transform: translateX(-50%);
  }
  .tabs button {
    padding: 0 25px;
  }
  .fullscreen-button {
    margin-top: -5px;
  }
  .fullscreen-button span {
    display: none;
  }
  .main {
    padding-top: 95px;
  }
  .clock-surface {
    margin-top: 0;
  }
  .time-display {
    font-size: 16vw;
  }
  .date-line {
  color: var(--muted);
    font-size: 13px;
    gap: 13px;
    margin-top: 24px;
    letter-spacing: 0.5px;
  }
  .secondary-space {
    height: 205px;
    padding-top: 35px;
  }
  .minute-track {
    width: 160px;
  }
  .presets {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    width: 100%;
    max-width: 360px;
    gap: 6px;
  }
  .presets button {
    padding: 8px 4px;
    font-size: 11px;
    justify-content: center;
    white-space: nowrap;
  }
  .presets svg {
    display: none;
  }
  .timer-actions {
    width: min(100%, 300px);
    margin-inline: auto;
    gap: 16px;
  }
  .timer-actions .primary-button {
    flex: 1;
    min-width: 0;
    padding-inline: 16px;
    white-space: nowrap;
  }
  .timer-actions .quiet-button {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
  }
  .timer-status {
    min-height: 20px;
    line-height: 20px;
    font-size: 13px;
  }
  .footer {
    min-height: 90px;
    height: auto;
    font-size: 10px;
    gap: 8px;
  }
  .timezone {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    gap: 8px;
    justify-content: flex-start;
  }
  .timezone-details {
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
    gap: 3px;
  }
  .timezone-name {
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .timezone-icon,
  .timezone svg {
    flex-shrink: 0;
  }
  .offset {
    margin-left: 0;
    white-space: nowrap;
  }
  .theme-button,
  .language-button {
    font-size: 11px;
    gap: 6px;
    min-height: 44px;
    padding: 0 8px;
    flex-shrink: 0;
  }
  .theme-button {
    width: 44px;
    padding: 0;
  }
  .footer-right {
    gap: 2px;
    flex-shrink: 0;
  }
  .theme-button span {
    display: none;
  }
}
@media (max-width: 380px) {
  .page {
    padding: 0 16px;
  }
  .timezone {
    padding-left: 0;
    font-size: 12px;
  }
  .timezone svg {
    width: 12px;
    height: 12px;
  }
  .timezone-icon {
    display: none;
  }
}
@media (max-height: 600px) and (min-width: 701px) {
  .header {
    height: 75px;
  }
  .main {
    padding: 12px 0;
  }
  .clock-surface {
    margin-top: 0;
  }
  .time-display {
    font-size: min(13vw, 27vh);
  }
  .date-line,
  .timer-status {
    min-height: 20px;
    line-height: 20px;
    margin-top: 12px;
  }
  .secondary-space {
    padding-top: 15px;
    height: 175px;
  }
  .timer-actions {
    margin-top: 12px;
  }
  .footer {
    height: 55px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .page {
    transition: none;
  }
}
</style>
