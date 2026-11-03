# A Few Good Uploads

An interactive courtroom-themed presentation and local DOCX forensics lab about what Word metadata can, and cannot, reveal about AI-assisted writing. **Document metadata is contextual forensic evidence, not a validated standalone test of AI authorship.** No authorship score or automated accusation is produced.

## Getting started

Requires Node.js 24 and npm. In the project directory:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Production and quality checks:

```sh
npm run build
npm run lint
npm test
npm run preview
```

`npm run test:browser` runs a Playwright smoke test against a separately running development server at `http://127.0.0.1:5173`. Install Chromium with `npx playwright install chromium` and, on Linux, its required system libraries with `npx playwright install-deps chromium` where administrator access is available.

## Presentation

Use the arrow keys or the navigation buttons to move between slides; Space advances. The footer offers a slide overview, optional presenter notes, fullscreen, and progress. Notes are hidden by default, but appear in the same browser window when opened, so do not enable them on a shared audience screen unless appropriate. Open the lab from the header or the live-demonstration slide; returning to the presentation preserves the current slide and analysis for the session. Refreshing the page clears the in-memory analysis.

## Forensics lab

Drop or choose a `.docx`, or select a clearly labeled synthetic exhibit. The file is read and analyzed in the browser. The lab displays package inventory, stored core and application properties, custom properties, selected settings, timestamps, document structures, retained changes, comments, media and embedded-object paths, and read-only XML. Search the raw package inventory by path. Source paths and element names accompany observations. JSON and printable HTML reports can contain personal metadata and document content, so handle exports accordingly.

Application statistics are values stored by the application, not independently calculated totals. A missing property, an empty property, and a parsing error are displayed separately. Counts describe the parsed main document and retained comments, not a complete editing or clipboard history. Timestamps can be reset, changed, or inherited. A short interval is not evidence that AI was used. External drafts, account information, and platform history require independent collection and verification.

## Synthetic exhibits

- **A: Conventional Drafting.** A synthetic human drafting history with retained tracked changes.
- **B: Minimal Metadata.** A synthetic human-created file with sparse metadata and no retained revisions.
- **C: AI-Assisted Workflow.** A synthetic file whose supplied history describes AI assistance.

These histories are provided as demonstration context, never inferred by the parser. Download each DOCX from the lab, or generate all three locally with `npm run samples` (writes to `examples/synthetic/`). These are synthetic illustrations, not authentic forensic evidence.

## Privacy, safety, and scope

There is no backend, account, external AI service, analytics, document upload, or remote font request. Files and generated reports stay on the device unless the user saves or shares them. Processing is memory-only until a user exports a report or exhibit. The app does not execute macros or embedded content, resolve external relationships, or fetch XML entities; XML with DTD or entity declarations is rejected. XML is rendered as text, not HTML.

Defaults in `src/forensics/zip.ts` limit input to 20 MiB, 1,000 entries, 8 MiB per decompressed entry, and 64 MiB total declared decompressed size. ZIP directory and local headers, CRCs for read XML, and streamed decompressed sizes are checked. Limits can be changed through `SafetyLimits` when calling the parser. The browser must support `DecompressionStream('deflate-raw')` for compressed entries. Standard transitional WordprocessingML DOCX packages with the main part at `word/document.xml` and UTF-8 XML are supported. Encrypted, ZIP64, multi-disk, macro-enabled, Strict OOXML, nonstandard main-part locations, and other unsupported packages are rejected or may have unsupported parts. Malformed optional XML is reported, not silently treated as a successful parse. Only the main document is counted for paragraphs, runs, links, and tracked changes; headers, footers, footnotes, alternate content, and collaboration services are not a complete history. Media and embedded-object counts are package-path inventories, not a complete semantic inventory. Custom property values are displayed as serialized text and may not capture complex types fully. Package size and integrity checks reduce risk but do not make untrusted documents a substitute for a hardened forensic sandbox.

## Deploy to GitHub Pages

The Vite build uses relative asset paths, so the generated `dist/` works under a repository subpath. The included GitHub Actions workflow builds and deploys to Pages on pushes to `main`. In repository settings, set **Pages > Build and deployment > Source** to **GitHub Actions**. Alternatively, upload the contents of `dist/` to a static host. No server-side runtime is needed.

## References

- [Microsoft: Open XML SDK and file formats](https://learn.microsoft.com/en-us/office/open-xml/open-xml-sdk)
- [Microsoft: Structure of a WordprocessingML document](https://learn.microsoft.com/en-us/office/open-xml/word/structure-of-a-wordprocessingml-document)
- [ECMA-376 Office Open XML standard](https://ecma-international.org/publications-and-standards/standards/ecma-376/)
- [MDN: DecompressionStream](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream)