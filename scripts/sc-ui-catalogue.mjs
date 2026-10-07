// Localises literal UI labels without touching teaching content from the server.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { Converter } from 'opencc-js'
import { mainlandTerms, literalCopy } from './mainland-ui-copy.mjs'

const converter = Converter({ from: 'twp', to: 'cn' })
const simplify = (text) => literalCopy[text] ?? mainlandTerms(converter(text))
const catalogueFile = 'src/lib/uiLocales.generated.ts'
const englishFile = 'scripts/sc-ui-english.json'
const strings = new Set()
const changes = []
const han = /[\p{Script=Han}]/u

function jsxText(text) {
  const lines = text.split(/\r\n|\n|\r/)
  let last = -1
  for (let i = 0; i < lines.length; i++) if (/\S/.test(lines[i])) last = i
  return lines.map((line, i) => {
    let cleaned = line.replace(/\t/g, ' ')
    if (i !== 0) cleaned = cleaned.replace(/^ +/, '')
    if (i !== lines.length - 1) cleaned = cleaned.replace(/ +$/, '')
    return cleaned ? cleaned + (i !== last ? ' ' : '') : ''
  }).join('')
}
for (const dir of ['src/components', 'src/routes', 'src']) {
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.tsx'))) {
    const filename = path.join(dir, file)
    const code = fs.readFileSync(filename, 'utf8')
    const source = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const edits = []
    function replace(node, value, expression = false) {
      if (!han.test(value)) return
      strings.add(value)
      edits.push({ start: node.getStart(source), end: node.end,
        text: `${expression ? '' : '{'}uiText(${JSON.stringify(value)})${expression ? '' : '}'}` })
    }
    function visit(node) {
      if (ts.isCallExpression(node) && ['uiText', 'uiFormat'].includes(node.expression.getText(source))) return
      if (ts.isJsxText(node)) replace(node, jsxText(node.getText(source)))
      else if (ts.isStringLiteral(node)) {
        if (ts.isJsxAttribute(node.parent) && ['title', 'placeholder', 'aria-label', 'alt'].includes(node.parent.name.getText(source))) replace(node, node.text)
        else {
          let parent = node.parent
          while (parent && !ts.isJsxExpression(parent) && !ts.isFunctionLike(parent) && !ts.isSourceFile(parent)) parent = parent.parent
          if (parent && ts.isJsxExpression(parent) && !ts.isPropertyAssignment(node.parent) && !ts.isElementAccessExpression(node.parent)) replace(node, node.text, true)
        }
      }
      if (ts.isTemplateExpression(node) && han.test(node.getText(source))) {
        let parent = node.parent
        while (parent && !ts.isJsxExpression(parent) && !ts.isFunctionLike(parent) && !ts.isSourceFile(parent)) parent = parent.parent
        if (parent && ts.isJsxExpression(parent)) {
          const template = node.head.text + node.templateSpans.map((span, i) => `{${i}}${span.literal.text}`).join('')
          strings.add(template)
          edits.push({ start: node.getStart(source), end: node.end,
            text: `uiFormat(${JSON.stringify(template)}, [${node.templateSpans.map((span) => span.expression.getText(source)).join(', ')}])` })
          return
        }
      }
      if (ts.isJsxExpression(node) && node.expression && ts.isIdentifier(node.expression)
        && /(?:Error|Notice|error|notice)$/.test(node.expression.text)) {
        edits.push({ start: node.expression.getStart(source), end: node.expression.end, text: `uiText(${node.expression.text})` })
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    // Error/notice text can originate outside JSX; catalogue it for display only.
    function collect(node) {
      if (ts.isStringLiteral(node) && han.test(node.text)) strings.add(node.text)
      ts.forEachChild(node, collect)
    }
    collect(source)
    if (edits.length) {
      let result = code
      for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
      const helperPath = dir === 'src' ? './lib/uiText' : '../lib/uiText'
      if (edits.some((edit) => edit.text.includes('uiFormat('))) {
        result = result.replace("import { uiText } from '../lib/uiText'", "import { uiText, uiFormat } from '../lib/uiText'")
        if (!result.includes("import { uiText, uiFormat }")) result = `import { uiText, uiFormat } from '${helperPath}'\n` + result
      } else if (!code.includes("import { uiText }")) result = `import { uiText } from '${helperPath}'\n` + result
      changes.push({ filename, result })
    }
  }
}
for (const filename of ['src/lib/proficiency.ts', 'src/lib/teachingTracks.ts', 'src/lib/appProfiles.ts']) {
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true)
  function collect(node) {
    if (ts.isStringLiteral(node) && han.test(node.text)) strings.add(node.text)
    ts.forEachChild(node, collect)
  }
  collect(source)
}
fs.writeFileSync('scripts/sc-ui-source.json', JSON.stringify([...strings].sort(), null, 2) + '\n')
console.log(`${strings.size} literal strings, ${changes.length} UI files`)
if (process.argv.includes('--apply')) {
  const english = JSON.parse(fs.readFileSync(englishFile, 'utf8'))
  const catalogue = Object.fromEntries([...strings].map((text) => [text, { 'zh-CN': simplify(text), en: english[text] || text }]))
  fs.writeFileSync(catalogueFile, '// Generated by scripts/sc-ui-catalogue.mjs.\nexport const uiLocales: Record<string, { "zh-CN": string; en: string }> = ' + JSON.stringify(catalogue, null, 2) + '\n')
  for (const { filename, result } of changes) fs.writeFileSync(filename, result)
}
