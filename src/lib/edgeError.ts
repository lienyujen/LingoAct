/**
 * The message the edge function actually sent.
 *
 * supabase-js throws a FunctionsHttpError whose own message is the string
 * "Edge Function returned a non-2xx status code" — the same sentence whatever
 * went wrong, with the response body still sitting unread on `context`. A panel
 * that rethrows the SDK error shows a teacher that sentence and nothing else,
 * which is exactly as useful as it sounds.
 */
export async function edgeFunctionErrorMessage(error: unknown, fallback: string) {
  const context = (error as { context?: Response } | null)?.context
  if (context) {
    try {
      const payload = await context.clone().json() as { message?: unknown }
      if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim()
    } catch {
      // Not JSON — an unhandled throw inside the function comes back as text.
      try {
        const text = (await context.clone().text()).trim()
        if (text) return text.slice(0, 300)
      } catch {
        // Fall through to the SDK message.
      }
    }
  }
  return error instanceof Error && error.message ? error.message : fallback
}
