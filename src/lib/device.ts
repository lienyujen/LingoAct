const key = 'lingoact_device_id'

export function getDeviceId() {
  const existing = localStorage.getItem(key)
  if (existing) return existing

  const id = crypto.randomUUID()
  localStorage.setItem(key, id)
  return id
}
