type DiagnosticDetails = Record<string, string | number | boolean | null | undefined>

export function logDiagnostic(event: string, details: DiagnosticDetails = {}) {
  const payload = {
    event,
    online: navigator.onLine,
    ...details,
  }
  console.warn(`[LingoAct] ${event}`, payload)
  void window.lingoActDesktop?.logDiagnostic(payload).catch(() => {
    // Diagnostics must never interfere with a live class.
  })
}
