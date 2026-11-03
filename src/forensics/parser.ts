import { DEFAULT_LIMITS, inspectZip, type SafetyLimits } from './zip'
import { interpret } from './interpret'
import type { Analysis, AnalysisWarning, Comment, ExtractedProperty, Revision } from '../types/forensics'

const NS = { core: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties', dc: 'http://purl.org/dc/elements/1.1/', dcterms: 'http://purl.org/dc/terms/', app: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties', custom: 'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties', word: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', types: 'http://schemas.openxmlformats.org/package/2006/content-types', rel: 'http://schemas.openxmlformats.org/package/2006/relationships' }
const coreFields = [['Creator', NS.dc, 'creator'], ['Last modified by', NS.core, 'lastModifiedBy'], ['Created', NS.dcterms, 'created'], ['Modified', NS.dcterms, 'modified'], ['Revision', NS.core, 'revision'], ['Title', NS.dc, 'title'], ['Subject', NS.dc, 'subject'], ['Description', NS.dc, 'description'], ['Keywords', NS.core, 'keywords'], ['Category', NS.core, 'category']]
const appFields = [['Application', 'Application'], ['Application version', 'AppVersion'], ['Total editing time (minutes)', 'TotalTime'], ['Pages', 'Pages'], ['Words', 'Words'], ['Characters', 'Characters'], ['Paragraphs', 'Paragraphs'], ['Lines', 'Lines'], ['Template', 'Template']]

function parseXml(text: string): Document {
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(text)) throw new Error('DTD and entity declarations are not supported.')
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName === 'parsererror') throw new Error('Malformed XML.')
  return doc
}
function property(doc: Document | null, label: string, namespace: string, name: string, source: string, failed: boolean): ExtractedProperty {
  const element = doc?.getElementsByTagNameNS(namespace, name)[0]
  const value = element?.textContent ?? null
  return { label, value, status: failed ? 'error' : !element ? 'missing' : value === '' ? 'empty' : 'present', source, locator: `{${namespace}}${name}` }
}
function wordAttr(element: Element, name: string) { return element.getAttributeNS(NS.word, name) }
function wordElements(doc: Document | null, name: string) { return doc ? Array.from(doc.getElementsByTagNameNS(NS.word, name)) : [] }

export async function analyzeDocx(buffer: ArrayBuffer, filename: string, limits: SafetyLimits = DEFAULT_LIMITS): Promise<Analysis> {
  if (!filename.toLowerCase().endsWith('.docx')) throw new Error('Choose a .docx file.')
  const zip = await inspectZip(buffer, limits)
  const byPath = new Map(zip.entries.map(entry => [entry.path, entry]))
  const required = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']
  if (required.some(path => !byPath.has(path))) throw new Error('Unsupported package: required DOCX parts are missing.')
  const xml: Record<string, string> = {}
  const docs = new Map<string, Document>()
  const warnings: AnalysisWarning[] = []
  const failures = new Set<string>()
  for (const entry of zip.entries.filter(item => /\.(xml|rels)$/i.test(item.path))) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await zip.read(entry))
      xml[entry.path] = text
      docs.set(entry.path, parseXml(text))
    } catch (error) {
      failures.add(entry.path)
      warnings.push({ source: entry.path, message: error instanceof Error ? error.message : 'Unable to parse XML.' })
      if (required.includes(entry.path)) throw new Error(`Invalid required part ${entry.path}: ${warnings[warnings.length - 1].message}`)
    }
  }
  const types = docs.get('[Content_Types].xml')!
  const rels = docs.get('_rels/.rels')!
  const main = docs.get('word/document.xml')!
  const hasMainType = Array.from(types.getElementsByTagNameNS(NS.types, 'Override')).some(item => item.getAttribute('PartName') === '/word/document.xml' && item.getAttribute('ContentType') === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')
  const hasMainRel = Array.from(rels.getElementsByTagNameNS(NS.rel, 'Relationship')).some(item => item.getAttribute('Type') === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' && (item.getAttribute('Target') === 'word/document.xml' || item.getAttribute('Target') === '/word/document.xml') && item.getAttribute('TargetMode') !== 'External')
  if (!hasMainType || !hasMainRel || main.documentElement.namespaceURI !== NS.word || main.documentElement.localName !== 'document') throw new Error('Unsupported package: not a standard Word DOCX document.')
  const corePath = 'docProps/core.xml'
  const appPath = 'docProps/app.xml'
  const customPath = 'docProps/custom.xml'
  const core = coreFields.map(([label, ns, name]) => property(docs.get(corePath) ?? null, label, ns, name, corePath, failures.has(corePath)))
  const extended = appFields.map(([label, name]) => property(docs.get(appPath) ?? null, label, NS.app, name, appPath, failures.has(appPath)))
  const customDoc = docs.get(customPath)
  const custom: ExtractedProperty[] = customDoc ? Array.from(customDoc.getElementsByTagNameNS(NS.custom, 'property')).map(element => {
    const child = element.firstElementChild
    const value = child?.textContent ?? ''
    return { label: element.getAttribute('name') ?? '(unnamed)', value, status: value === '' ? 'empty' : 'present', source: customPath, locator: `property[name=${element.getAttribute('name') ?? ''}]`, type: child?.localName ?? 'unknown' }
  }) : []
  const revisions: Revision[] = (['ins', 'del'] as const).flatMap(name => wordElements(main, name).map(element => ({ kind: name === 'ins' ? 'insertion' as const : 'deletion' as const, author: wordAttr(element, 'author'), date: wordAttr(element, 'date'), source: `word/document.xml: w:${name}` })))
  const comments: Comment[] = wordElements(docs.get('word/comments.xml') ?? null, 'comment').map(element => ({ id: wordAttr(element, 'id'), author: wordAttr(element, 'author'), date: wordAttr(element, 'date'), text: element.textContent ?? '', source: 'word/comments.xml: w:comment' }))
  const styles = new Map<string, number>()
  for (const name of ['pStyle', 'rStyle']) for (const element of wordElements(main, name)) { const value = wordAttr(element, 'val'); if (value) styles.set(value, (styles.get(value) ?? 0) + 1) }
  const settingsDoc = docs.get('word/settings.xml') ?? null
  const settings = ['trackRevisions', 'documentProtection', 'compat'].map(name => {
    const element = wordElements(settingsDoc, name)[0]
    return { label: name, value: element ? (wordAttr(element, 'val') ?? 'present') : null, status: failures.has('word/settings.xml') ? 'error' as const : element ? 'present' as const : 'missing' as const, source: 'word/settings.xml', locator: `w:${name}` }
  })
  const created = core.find(item => item.label === 'Created')?.value
  const modified = core.find(item => item.label === 'Modified')?.value
  const difference = created && modified ? Date.parse(modified) - Date.parse(created) : NaN
  const interval = Number.isFinite(difference) && difference >= 0 ? `${Math.floor(difference / 86400000)} days, ${Math.floor((difference % 86400000) / 3600000)} hours, ${Math.floor((difference % 3600000) / 60000)} minutes` : null
  if (created && modified && !interval) warnings.push({ source: corePath, message: 'Timestamps are invalid or the modification precedes creation; no interval was calculated.' })
  const analysis: Omit<Analysis, 'findings'> = { filename, size: buffer.byteLength, entries: zip.entries, core, extended, custom, xml, warnings, interval, structure: { paragraphs: wordElements(main, 'p').length, runs: wordElements(main, 'r').length, hyperlinks: wordElements(main, 'hyperlink').length, styles: Array.from(styles, ([name, count]) => ({ name, count })), revisions, comments, media: zip.entries.filter(entry => entry.path.startsWith('word/media/')).map(entry => entry.path), embedded: zip.entries.filter(entry => entry.path.startsWith('word/embeddings/')).map(entry => entry.path), settings } }
  return { ...analysis, findings: interpret(analysis) }
}