import JSZip from 'jszip'

export const samples = [
  { id: 'A', title: 'Conventional Drafting', history: 'Synthetic known history: a human drafted this document and retained tracked changes.' },
  { id: 'B', title: 'Minimal Metadata', history: 'Synthetic known history: a human created a new file with sparse properties and no retained revisions.' },
  { id: 'C', title: 'AI-Assisted Workflow', history: 'Synthetic known history: the author used AI assistance while preparing the text. This history is supplied, not inferred from the file.' },
] as const

export async function makeSample(id: 'A' | 'B' | 'C'): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>')
  zip.file('_rels/.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>${id !== 'B' ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' : ''}</Relationships>`)
  const text = id === 'A' ? '<w:p><w:r><w:t>A careful draft considers the evidence.</w:t></w:r><w:ins w:id="1" w:author="Casey Example" w:date="2025-03-01T10:00:00Z"><w:r><w:t> The conclusion remains open.</w:t></w:r></w:ins></w:p>' : '<w:p><w:r><w:t>The evidence must be interpreted in context.</w:t></w:r></w:p>'
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text}<w:sectPr/></w:body></w:document>`)
  if (id !== 'B') zip.file('docProps/core.xml', `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>${id === 'A' ? 'Casey Example' : 'Jordan Example'}</dc:creator><cp:lastModifiedBy>${id === 'A' ? 'Casey Example' : 'Jordan Example'}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2025-03-01T09:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2025-03-01T10:00:00Z</dcterms:modified><cp:revision>2</cp:revision></cp:coreProperties>`)
  return zip.generateAsync({ type: 'uint8array' })
}