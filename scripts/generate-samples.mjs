import { mkdir, writeFile } from 'node:fs/promises'
import { makeSample, samples } from '../src/data/samples.ts'

await mkdir('examples/synthetic', { recursive: true })
for (const sample of samples) {
  await writeFile(`examples/synthetic/Exhibit-${sample.id}-synthetic.docx`, await makeSample(sample.id))
  console.log(`Created Exhibit ${sample.id}: ${sample.history}`)
}