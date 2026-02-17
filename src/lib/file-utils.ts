export function sanitizeFilename(filename: string): string {
  // Prevent path traversal / invalid storage object keys. Keep it human-readable.
  const base = (filename || 'archivo')
    .replace(/[\\/]+/g, '_')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
  return base.length > 0 ? base : 'archivo'
}

export function inferMimeTypeFromFilename(filename: string): string | null {
  const lower = (filename || '').toLowerCase().trim()
  const ext = lower.includes('.') ? lower.split('.').pop() || '' : ''
  switch (ext) {
    case 'pdf': return 'application/pdf'
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'doc': return 'application/msword'
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'xls': return 'application/vnd.ms-excel'
    case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    case 'ppt': return 'application/vnd.ms-powerpoint'
    case 'csv': return 'text/csv'
    case 'txt': return 'text/plain'
    case 'md': return 'text/markdown'
    case 'json': return 'application/json'
    case 'xml': return 'application/xml'
    case 'html':
    case 'htm': return 'text/html'
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'svg': return 'image/svg+xml'
    case 'mp3': return 'audio/mpeg'
    case 'wav': return 'audio/wav'
    case 'm4a': return 'audio/mp4'
    case 'mp4': return 'video/mp4'
    case 'mov': return 'video/quicktime'
    case 'webm': return 'video/webm'
    default: return null
  }
}

export function coerceMimeType(fileType: string | null | undefined, filename: string): string {
  const trimmed = (fileType || '').trim()
  if (trimmed) return trimmed
  return inferMimeTypeFromFilename(filename) || 'application/octet-stream'
}

