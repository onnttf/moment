/** Standard Fullscreen API plus the prefixed API used by older Safari/WebViews. */
export type FullscreenHost = {
  fullscreenElement?: unknown
  webkitFullscreenElement?: unknown
  exitFullscreen?: () => Promise<void> | void
  webkitExitFullscreen?: () => Promise<void> | void
  documentElement: {
    requestFullscreen?: () => Promise<void> | void
    webkitRequestFullscreen?: () => Promise<void> | void
  }
}

export function createFullscreenController(host: FullscreenHost) {
  let pending: Promise<boolean> | undefined
  const isActive = () => Boolean(host.fullscreenElement || host.webkitFullscreenElement)

  async function transition() {
    if (isActive()) {
      // Use the API that owns the active fullscreen session.
      if (host.fullscreenElement && host.exitFullscreen) await host.exitFullscreen()
      else if (host.webkitExitFullscreen) await host.webkitExitFullscreen()
      else throw new Error('Fullscreen exit is unavailable')
    } else {
      const root = host.documentElement
      if (root.requestFullscreen) await root.requestFullscreen()
      else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen()
      else throw new Error('Fullscreen is unavailable')
    }
    return isActive()
  }

  return {
    isActive,
    toggle() {
      // One transition at a time, including keyboard and pointer interactions.
      pending ??= transition().finally(() => {
        pending = undefined
      })
      return pending
    },
  }
}
