import JSZip from 'jszip'
import type { PackageEntry } from '../types/forensics'

export type SafetyLimits = { maxFileBytes: number; maxEntries: number; maxEntryBytes: number; maxTotalBytes: number }
export const DEFAULT_LIMITS: SafetyLimits = { maxFileBytes: 20 * 1024 * 1024, maxEntries: 1000, maxEntryBytes: 8 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024 }

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

export async function inspectZip(buffer: ArrayBuffer, limits: SafetyLimits) {
  if (buffer.byteLength > limits.maxFileBytes) throw new Error('File exceeds the configured size limit.')
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let end = -1
  for (let position = bytes.length - 22; position >= Math.max(0, bytes.length - 65557); position--) {
    if (view.getUint32(position, true) === 0x06054b50 && position + 22 + view.getUint16(position + 20, true) === bytes.length) { end = position; break }
  }
  if (end < 0) throw new Error('Not a valid ZIP package.')
  const count = view.getUint16(end + 10, true)
  const centralSize = view.getUint32(end + 12, true)
  const centralOffset = view.getUint32(end + 16, true)
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || count === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) throw new Error('Multi-disk and ZIP64 packages are unsupported.')
  if (count > limits.maxEntries || centralOffset + centralSize > end) throw new Error('ZIP package exceeds entry limits or has an invalid directory.')
  const entries: PackageEntry[] = []
  const seen = new Set<string>()
  let position = centralOffset
  let total = 0
  for (let index = 0; index < count; index++) {
    if (position + 46 > end || view.getUint32(position, true) !== 0x02014b50) throw new Error('Invalid ZIP directory entry.')
    const flags = view.getUint16(position + 8, true)
    const method = view.getUint16(position + 10, true)
    const crc = view.getUint32(position + 16, true)
    const compressedSize = view.getUint32(position + 20, true)
    const uncompressedSize = view.getUint32(position + 24, true)
    const nameLength = view.getUint16(position + 28, true)
    const extraLength = view.getUint16(position + 30, true)
    const commentLength = view.getUint16(position + 32, true)
    const offset = view.getUint32(position + 42, true)
    const next = position + 46 + nameLength + extraLength + commentLength
    if (next > centralOffset + centralSize) throw new Error('Invalid ZIP directory bounds.')
    const path = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(position + 46, position + 46 + nameLength))
    if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => part === '..' || part === '.') || seen.has(path)) throw new Error('Unsafe or duplicate ZIP entry path.')
    if ((flags & 1) || (method !== 0 && method !== 8)) throw new Error('Encrypted or unsupported ZIP entries are not supported.')
    total += uncompressedSize
    if (uncompressedSize > limits.maxEntryBytes || total > limits.maxTotalBytes) throw new Error('ZIP package exceeds decompressed size limits.')
    if (offset + 30 > centralOffset || view.getUint32(offset, true) !== 0x04034b50) throw new Error('Invalid ZIP local entry.')
    const localNameLength = view.getUint16(offset + 26, true)
    const localExtraLength = view.getUint16(offset + 28, true)
    const dataStart = offset + 30 + localNameLength + localExtraLength
    if (dataStart + compressedSize > centralOffset || view.getUint16(offset + 8, true) !== method || view.getUint16(offset + 6, true) !== flags || new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + localNameLength)) !== path) throw new Error('Inconsistent ZIP entry headers.')
    seen.add(path)
    if (!path.endsWith('/')) entries.push({ path, compressedSize, uncompressedSize, method, offset: dataStart, crc })
    position = next
  }
  if (position !== centralOffset + centralSize) throw new Error('Invalid ZIP directory length.')
  try { await JSZip.loadAsync(buffer) } catch { throw new Error('Invalid or unsupported ZIP package.') }
  async function read(entry: PackageEntry): Promise<Uint8Array> {
    const compressed = bytes.slice(entry.offset, entry.offset + entry.compressedSize)
    let result: Uint8Array
    if (entry.method === 0) result = compressed
    else {
      const source = new ReadableStream<BufferSource>({ start(controller) { controller.enqueue(compressed); controller.close() } })
      const reader = source.pipeThrough(new DecompressionStream('deflate-raw')).getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          const part = await reader.read()
          if (part.done) break
          size += part.value.length
          if (size > entry.uncompressedSize || size > limits.maxEntryBytes) { await reader.cancel(); throw new Error('ZIP entry exceeds declared or configured size.') }
          chunks.push(part.value)
        }
      } catch { throw new Error(`Unable to safely decompress ${entry.path}.`) }
      result = new Uint8Array(size)
      let cursor = 0
      for (const chunk of chunks) { result.set(chunk, cursor); cursor += chunk.length }
    }
    if (result.length !== entry.uncompressedSize || crc32(result) !== entry.crc) throw new Error(`ZIP integrity check failed for ${entry.path}.`)
    return result
  }
  return { entries, read }
}