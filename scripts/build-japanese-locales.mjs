import fs from 'node:fs'
import ts from 'typescript'
import { teacherJapanese, studentJapanese, literalJapanese, workspaceJapanese } from './japanese-ui-copy.mjs'

export function readTable(filename, name) {
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true)
  let result
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      const value = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer
      result = new Function(`return ${value.getText(source)}`)()
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!result) throw new Error(`Missing table ${name} in ${filename}`)
  return result
}

const presenter = readTable('src/lib/presenterI18n.ts', 'messages')
const participant = readTable('src/lib/participantI18n.ts', 'messages')
const previousTeacher = readTable('src/lib/presenterLocales.generated.ts', 'generatedPresenterLocales').ja
const previousStudent = readTable('src/lib/participantLocales.generated.ts', 'generatedLocales').ja
const literals = readTable('src/lib/uiLocales.generated.ts', 'uiLocales')
const placeholders = text => (text.match(/\{(?:\w+|\d+)\}/g) || []).sort().join('|')
function complete(source, previous, reviewed, label) {
  return Object.fromEntries(Object.entries(source).map(([key, text]) => {
    const translated = (reviewed[key] ?? previous[key])?.replaceAll('講師', '教師').replaceAll('生徒', '学習者').replaceAll('受講生', '学習者').replaceAll('Exit Ticket', '振り返り').replaceAll('サマリー', 'まとめ')
    if (!translated) throw new Error(`${label}: untranslated ${key}`)
    if (placeholders(translated) !== placeholders(text)) throw new Error(`${label}: placeholder mismatch ${key}`)
    return [key, translated]
  }))
}
const teacher = complete(presenter['zh-TW'], previousTeacher, teacherJapanese, 'Teacher')
const student = complete(participant['zh-TW'], previousStudent, studentJapanese, 'Student')
const shared = {}
for (const [source, translations] of [[presenter['zh-TW'], teacher], [participant['zh-TW'], student]]) {
  for (const [key, text] of Object.entries(source)) shared[text] ??= translations[key]
}
Object.assign(shared, literalJapanese)
for (const text of Object.keys(literals)) if (!shared[text]) throw new Error(`Untranslated shared UI: ${text}`)
for (const [text, translated] of Object.entries(shared)) {
  if (placeholders(text) !== placeholders(translated)) throw new Error(`Shared UI placeholder mismatch: ${text}`)
}
const output = { japanesePresenter: teacher, japaneseParticipant: student, japaneseLiterals: shared, japaneseWorkspace: workspaceJapanese }
fs.writeFileSync('src/lib/japaneseLocales.ts', '// Built by scripts/build-japanese-locales.mjs from reviewed Japanese copy and the existing Japanese catalogues.\n'
  + Object.entries(output).map(([name, table]) => `export const ${name}: Record<string, string> = ${JSON.stringify(table, null, 2)}\n`).join('\n'))
console.log(`Japanese: ${Object.keys(teacher).length} teacher, ${Object.keys(student).length} student, ${Object.keys(shared).length} shared strings`)
