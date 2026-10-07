// A page translator can replace React's Text nodes with <font> wrappers.
// React still owns the original nodes: replacing a question then throws a
// NotFoundError, and updating a score can silently leave the old value visible.
// The built-in language picker translates explanations without touching Chinese
// teaching content. Restore only recognisable translator replacements so that
// forced browser translation cannot detach those live nodes from React.
export function guardTranslationDom(root: HTMLElement) {
  root.setAttribute('translate', 'no')
  root.classList.add('notranslate')
  const observer = new MutationObserver(records => {
    const replacements = records.flatMap((record, index) => [...record.addedNodes]
      .filter(node => node.nodeType === Node.ELEMENT_NODE && node.nodeName === 'FONT')
      .map(node => ({ node, record, index })))
    if (!replacements.length) return
    const used = new Set<Node>()
    for (const [index, record] of records.entries()) {
      if (!root.contains(record.target)) continue
      for (const original of record.removedNodes) {
        if (original.nodeType !== Node.TEXT_NODE || original.parentNode === record.target) continue
        const replacement = replacements.find(candidate => !used.has(candidate.node)
          && candidate.record.target === record.target && candidate.index >= index
          && candidate.record.nextSibling === record.nextSibling
          && candidate.node.parentNode === record.target)
        if (!replacement) continue
        // Move the actual original node back, rather than copying its text or
        // swallowing removeChild errors. React's next update must reach it.
        record.target.insertBefore(original, replacement.node)
        record.target.removeChild(replacement.node)
        used.add(replacement.node)
      }
    }
  })
  observer.observe(root, { childList: true, subtree: true })
  return () => observer.disconnect()
}
