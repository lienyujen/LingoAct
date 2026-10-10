// Cue offsets count Unicode characters; DOM offsets count UTF-16 code units.
export function englishTextRuns(text: string) {
  let offset = 0
  let index = 0
  return (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*|[^\p{L}\p{N}]+/gu) || []).map(value => {
    const run = { text: value, offset, start: index, end: index + [...value].length, word: /^[\p{L}\p{N}]/u.test(value) }
    offset += value.length
    index = run.end
    return run
  })
}
