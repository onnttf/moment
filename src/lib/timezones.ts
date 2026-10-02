export const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
export const timezoneNames: Record<string, [string, string]> = {
  'Asia/Shanghai': ['北京', 'Beijing'],
  'Asia/Tokyo': ['东京', 'Tokyo'],
  'Asia/Hong_Kong': ['香港', 'Hong Kong'],
  'Asia/Taipei': ['台北', 'Taipei'],
  'Asia/Singapore': ['新加坡', 'Singapore'],
  'Asia/Seoul': ['首尔', 'Seoul'],
  'Asia/Kolkata': ['新德里', 'New Delhi'],
  'Asia/Calcutta': ['新德里', 'New Delhi'],
  'Asia/Kathmandu': ['加德满都', 'Kathmandu'],
  'Asia/Katmandu': ['加德满都', 'Kathmandu'],
  'Asia/Dubai': ['迪拜', 'Dubai'],
  'Europe/London': ['伦敦', 'London'],
  'Europe/Paris': ['巴黎', 'Paris'],
  'Europe/Berlin': ['柏林', 'Berlin'],
  'America/New_York': ['纽约', 'New York'],
  'America/Los_Angeles': ['洛杉矶', 'Los Angeles'],
  'America/Chicago': ['芝加哥', 'Chicago'],
  'America/Toronto': ['多伦多', 'Toronto'],
  'Australia/Sydney': ['悉尼', 'Sydney'],
  'Pacific/Auckland': ['奥克兰', 'Auckland'],
  UTC: ['协调世界时', 'Coordinated Universal Time'],
}
const supportedValues = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] })
  .supportedValuesOf
export const timezones = [
  ...new Set([
    localTimezone,
    'UTC',
    ...Object.keys(timezoneNames),
    ...(supportedValues?.('timeZone') ?? []),
  ]),
]
export function isValidTimezone(zone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format()
    return true
  } catch {
    return false
  }
}
export function zoneName(zone: string, language: 'zh' | 'en') {
  return (
    timezoneNames[zone]?.[language === 'zh' ? 0 : 1] ??
    zone.split('/').at(-1)?.replaceAll('_', ' ') ??
    zone
  )
}
export function zoneOffset(zone: string, timestamp: number) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: zone,
    timeZoneName: 'longOffset',
  }).formatToParts(timestamp)
  return (parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT')
    .replace('GMT', 'UTC')
    .replace(/^UTC$/, 'UTC+00:00')
}
export function zoneClockParts(zone: string, timestamp: number) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp)
  return ['hour', 'minute', 'second'].map((type) => parts.find((part) => part.type === type)!.value)
}
