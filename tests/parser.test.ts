import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { analyzeDocx } from '../src/forensics/parser'
import { DEFAULT_LIMITS } from '../src/forensics/zip'
import { makeSample } from '../src/data/samples'

async function sample(id: 'A' | 'B' | 'C' = 'A') { const data = await makeSample(id); return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer }
async function mutate(path: string, value: string | null) {
  const zip = await JSZip.loadAsync(await sample())
  if (value === null) zip.remove(path); else zip.file(path, value)
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('DOCX forensic analysis', () => {
  it('extracts actual core properties and retained changes from a valid DOCX', async () => {
    const result = await analyzeDocx(await sample(), 'case.docx')
    expect(result.core.find(item => item.label === 'Creator')?.value).toBe('Casey Example')
    expect(result.structure.paragraphs).toBe(1)
    expect(result.structure.revisions).toMatchObject([{ kind: 'insertion', author: 'Casey Example' }])
    expect(result.findings.some(item => item.category === 'Inconclusive')).toBe(true)
  })
  it('reads DEFLATE-compressed Word packages', async () => {
    const zip = await JSZip.loadAsync(await sample())
    const compressed = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
    const result = await analyzeDocx(compressed, 'compressed.docx')
    expect(result.core.find(item => item.label === 'Creator')?.value).toBe('Casey Example')
  })
  it('extracts typed custom properties, comments, deletions and styles', async () => {
    const zip = await JSZip.loadAsync(await sample())
    zip.file('docProps/custom.xml', '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:v="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property name="Case"><v:lpwstr>Example</v:lpwstr></property></Properties>')
    zip.file('word/comments.xml', '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="1" w:author="Reviewer" w:date="2025-01-01T00:00:00Z"><w:p><w:r><w:t>Check source</w:t></w:r></w:p></w:comment></w:comments>')
    zip.file('word/document.xml', '<x:document xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><x:body><x:p><x:pPr><x:pStyle x:val="Heading1"/></x:pPr><x:del x:author="Reviewer"><x:r><x:delText>Old</x:delText></x:r></x:del><x:hyperlink><x:r><x:t>Link</x:t></x:r></x:hyperlink></x:p></x:body></x:document>')
    const result = await analyzeDocx(await zip.generateAsync({ type: 'arraybuffer' }), 'case.docx')
    expect(result.custom[0]).toMatchObject({ label: 'Case', value: 'Example', type: 'lpwstr' })
    expect(result.structure.comments[0]).toMatchObject({ author: 'Reviewer', text: 'Check source' })
    expect(result.structure.revisions[0]).toMatchObject({ kind: 'deletion', author: 'Reviewer' })
    expect(result.structure.styles).toEqual([{ name: 'Heading1', count: 1 }])
    expect(result.structure.hyperlinks).toBe(1)
  })
  it('distinguishes missing properties and absent optional parts', async () => {
    const result = await analyzeDocx(await sample('B'), 'minimal.docx')
    expect(result.core.every(item => item.status === 'missing')).toBe(true)
    expect(result.structure.revisions).toHaveLength(0)
    expect(result.structure.comments).toHaveLength(0)
  })
  it('distinguishes empty properties and namespace prefix variations', async () => {
    const xml = '<x:coreProperties xmlns:x="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:y="http://purl.org/dc/elements/1.1/"><y:creator/><y:title>Sample</y:title></x:coreProperties>'
    const result = await analyzeDocx(await mutate('docProps/core.xml', xml), 'case.docx')
    expect(result.core.find(item => item.label === 'Creator')?.status).toBe('empty')
    expect(result.core.find(item => item.label === 'Title')?.value).toBe('Sample')
  })
  it('reports malformed optional XML without inventing missing values', async () => {
    const result = await analyzeDocx(await mutate('docProps/core.xml', '<broken>'), 'case.docx')
    expect(result.core[0].status).toBe('error')
    expect(result.warnings[0].source).toBe('docProps/core.xml')
  })
  it('rejects malformed required XML and unsupported packages', async () => {
    await expect(analyzeDocx(await mutate('word/document.xml', '<broken>'), 'case.docx')).rejects.toThrow('Invalid required part')
    await expect(analyzeDocx(await mutate('_rels/.rels', null), 'case.docx')).rejects.toThrow('required DOCX parts')
    await expect(analyzeDocx(new ArrayBuffer(8), 'case.docx')).rejects.toThrow('ZIP')
  })
  it('rejects DTDs without resolving external entities', async () => {
    const result = await analyzeDocx(await mutate('docProps/core.xml', '<!DOCTYPE x [<!ENTITY x SYSTEM "https://example.com">]><x>&x;</x>'), 'case.docx')
    expect(result.core[0].status).toBe('error')
    expect(result.warnings[0].message).toContain('DTD')
  })
  it('does not interpret a short or reversed timeline as AI evidence', async () => {
    const xml = '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:d="http://purl.org/dc/terms/"><d:created>2025-01-02T00:00:00Z</d:created><d:modified>2025-01-01T00:00:00Z</d:modified></cp:coreProperties>'
    const result = await analyzeDocx(await mutate('docProps/core.xml', xml), 'case.docx')
    expect(result.interval).toBeNull()
    expect(result.warnings.some(item => item.message.includes('precedes'))).toBe(true)
    expect(result.findings.some(item => item.category === 'Inconclusive')).toBe(true)
  })
  it('enforces input, entry count and decompressed size limits', async () => {
    const data = await sample()
    await expect(analyzeDocx(data, 'case.docx', { ...DEFAULT_LIMITS, maxFileBytes: 10 })).rejects.toThrow('size limit')
    await expect(analyzeDocx(data, 'case.docx', { ...DEFAULT_LIMITS, maxEntries: 1 })).rejects.toThrow('entry limits')
    await expect(analyzeDocx(data, 'case.docx', { ...DEFAULT_LIMITS, maxEntryBytes: 10 })).rejects.toThrow('decompressed size limits')
  })
  it('rejects incorrect extensions and corrupt ZIP data', async () => {
    await expect(analyzeDocx(await sample(), 'case.zip')).rejects.toThrow('.docx')
    const data = await sample(); new Uint8Array(data)[35] ^= 0xff
    await expect(analyzeDocx(data, 'case.docx')).rejects.toThrow()
  })
})