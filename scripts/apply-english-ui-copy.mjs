import fs from 'node:fs'
import ts from 'typescript'
import path from 'node:path'
import { teacherEnglish, studentEnglish, literalEnglish, inlineEnglish, englishStyle } from './english-ui-copy.mjs'

const placeholders = (text) => (text.match(/\{(?:\w+|\d+)\}/g) || []).sort().join('|')
const review = {}
for (const [filename, replacements] of [['src/lib/presenterI18n.ts', teacherEnglish], ['src/lib/participantI18n.ts', studentEnglish]]) {
  let code = fs.readFileSync(filename, 'utf8')
  const source = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true)
  const edits = [], entries = {}
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'messages') {
      const initializer = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer
      const column = initializer.properties.find((property) => property.name.text === 'en')
      for (const property of column.initializer.properties) {
        const key = property.name.text, original = property.initializer.text
        const updated = englishStyle(replacements[key] ?? original)
        if (placeholders(original) !== placeholders(updated)) throw new Error(`Placeholder mismatch: ${filename} ${key}`)
        entries[key] = updated
        if (updated !== original) edits.push({ start: property.initializer.getStart(source), end: property.initializer.end, text: JSON.stringify(updated) })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  for (const key of Object.keys(replacements)) if (!(key in entries)) throw new Error(`Unknown key: ${key}`)
  for (const edit of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end)
  fs.writeFileSync(filename, code)
  review[filename] = entries
  console.log(`${filename}: reviewed ${Object.keys(entries).length}, edited ${edits.length}`)
}
const literals = JSON.parse(fs.readFileSync('scripts/sc-ui-english.json', 'utf8'))
const sources = JSON.parse(fs.readFileSync('scripts/sc-ui-source.json', 'utf8'))
for (const text of sources) {
  const original = literals[text]
  if (original === undefined) throw new Error(`Missing English translation: ${text}`)
  const updated = englishStyle(literalEnglish[text] ?? original)
  if (placeholders(text) !== placeholders(updated)) throw new Error(`Placeholder mismatch: ${text}`)
  literals[text] = updated
}
fs.writeFileSync('scripts/sc-ui-english.json', JSON.stringify(literals, null, 2) + '\n')
review.literals = Object.fromEntries(sources.map((text) => [text, literals[text]]))
review.inline = []
for (const dir of ['src/components', 'src/routes']) {
  for (const filename of fs.readdirSync(dir).filter(name => name.endsWith('.tsx'))) {
    const target = path.join(dir, filename)
    let code = fs.readFileSync(target, 'utf8')
    const source = ts.createSourceFile(target, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const edits = []
    function visit(node) {
      if (ts.isStringLiteral(node) && /[A-Z]/.test(node.text[0]) && /[a-z] /.test(node.text) && !/[\p{Script=Han}]/u.test(node.text)) {
        const updated = englishStyle(inlineEnglish[node.text] ?? node.text)
        if (placeholders(node.text) !== placeholders(updated)) throw new Error(`Placeholder mismatch: ${target}`)
        review.inline.push({ filename: target, text: updated })
        if (updated !== node.text) edits.push({ start: node.getStart(source), end: node.end, text: JSON.stringify(updated) })
      }
      if (ts.isJsxText(node) && inlineEnglish[node.text.trim()]) {
        const updated = inlineEnglish[node.text.trim()]
        edits.push({ start: node.getStart(source), end: node.end, text: updated })
        review.inline.push({filename: target, text: updated})
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    for (const edit of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end)
    if (edits.length) fs.writeFileSync(target, code)
  }
}
const workspaceSource = ts.createSourceFile('workspaceText.ts', fs.readFileSync('src/lib/workspaceText.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const workspaceEnglish = workspaceSource.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(workspaceSource) === 'en')).declarationList.declarations[0].initializer
review.workspace = Object.fromEntries(workspaceEnglish.properties.map(property => [property.name.text, property.initializer.text]))
fs.writeFileSync('scripts/english-ui-reviewed.json', JSON.stringify(review, null, 2) + '\n')
console.log(`Shared UI: reviewed ${sources.length} strings`)
