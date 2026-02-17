const TRUTHY = new Set(['1', 'true', 'yes', 'on'])

const parseFlag = (value: string | undefined) => {
  if (!value) return false
  return TRUTHY.has(value.trim().toLowerCase())
}

export const AUTO_RAG_INGEST_ON_UPLOAD = parseFlag(
  process.env.NEXT_PUBLIC_AUTO_RAG_INGEST_ON_UPLOAD
)

export const SERVER_AUTO_RAG_INGEST_ON_UPLOAD = parseFlag(
  process.env.AUTO_RAG_INGEST_ON_UPLOAD ?? process.env.NEXT_PUBLIC_AUTO_RAG_INGEST_ON_UPLOAD
)
