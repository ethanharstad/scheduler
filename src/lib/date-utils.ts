export function formatTime(datetime: string) {
  const d = new Date(datetime)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function formatDuration(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const totalMinutes = Math.round(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

export function formatDate(datetime: string) {
  const d = new Date(datetime)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function getDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  let current = Date.UTC(sy, sm - 1, sd)
  const end = Date.UTC(ey, em - 1, ed)
  while (current <= end) {
    dates.push(new Date(current).toISOString().slice(0, 10))
    current += 86400000
  }
  return dates
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
