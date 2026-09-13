export function orderingRanking(items: string[], answers: string[][]) {
  return items.map(item => {
    const places = answers.map(a => a.indexOf(item)).filter(n => n >= 0)
    return { item, places, mean: places.length ? places.reduce((sum, n) => sum + n + 1, 0) / places.length : items.length + 1 }
  }).sort((a, b) => a.mean - b.mean).map((entry, i) => ({ ...entry, agreement: entry.places.length ? Math.round(entry.places.filter(n => n === i).length / entry.places.length * 100) : 0 }))
}
