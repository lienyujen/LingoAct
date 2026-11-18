// Split on sentence endings and paragraph breaks. Keep the original punctuation
// right through submission so a quotation can be checked against what was shown.
export function readingEvidenceSentences(body: string): string[] {
  return [...body.matchAll(/[^。！？!?\r\n]+(?:[。！？!?]+[」』”’]*)?/gu)]
    .map(([sentence]) => sentence.trim())
    .filter(Boolean)
}
