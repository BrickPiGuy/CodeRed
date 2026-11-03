import type { Analysis, EvidenceFinding } from '../types/forensics'

export function interpret(analysis: Omit<Analysis, 'findings'>): EvidenceFinding[] {
  const findings: EvidenceFinding[] = [
    { category: 'Directly observed', text: `${analysis.structure.paragraphs} paragraphs and ${analysis.structure.runs} text runs were found in the main document.`, source: 'word/document.xml: w:p, w:r' },
    { category: 'Context-dependent', text: 'Stored identities, dates, and application statistics can be edited, inherited, or affected by the software and workflow.', source: 'docProps/core.xml; docProps/app.xml' },
    { category: 'Inconclusive', text: 'The observed file structure and metadata cannot determine whether the prose was human-written, AI-assisted, or AI-generated.', source: 'Package as analyzed' },
    { category: 'Context-dependent', text: 'Corroborate relevant observations with authorized external drafts, platform history, and the author’s account of the workflow.', source: 'External evidence not analyzed' },
  ]
  if (!analysis.structure.revisions.length) findings.push({ category: 'Not available', text: 'No retained insertions or deletions were found in the main document. This does not mean no edits occurred.', source: 'word/document.xml: w:ins, w:del' })
  return findings
}