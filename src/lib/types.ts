export interface Profile {
  id: string
  name: string | null
  avatar_url: string | null
  settings_json: Record<string, unknown>
  role: 'user' | 'admin'
  custom_instructions_enabled: boolean
  custom_instructions_what: string
  custom_instructions_how: string
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  user_id: string
  name: string
  description: string
  memory_json: MemoryItem[]
  created_at: string
  updated_at: string
}

export interface Folder {
  id: string
  user_id: string
  name: string
  created_at: string
}

export interface Tag {
  id: string
  user_id: string
  name: string
  created_at: string
}

export type RagMode = 'off' | 'assisted' | 'strict'

export interface Conversation {
  id: string
  user_id: string
  project_id: string | null
  title: string
  pinned: boolean
  favorite: boolean
  folder_id: string | null
  model_default: string
  rag_mode: RagMode
  cite_mode: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
  forked_from_conversation_id: string | null
}

export interface Message {
  id: string
  conversation_id: string
  user_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  parent_message_id: string | null
  branch_id: string | null
  attachments_json: FileAttachment[]
  sources_json: ChunkSource[]
  edited_at: string | null
  edit_version: number
  active_version_id: string | null
  model?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta_json?: Record<string, any>
  created_at: string
  updated_at: string
}

export interface MessageEdit {
  id: string
  message_id: string
  previous_content: string
  new_content: string
  edited_at: string
  editor_user_id: string
}

export interface MessageVersion {
  id: string
  message_id: string
  version_index: number
  content: string
  model: string | null
  meta_json: Record<string, unknown>
  sources_json: ChunkSource[]
  created_at: string
}

export interface FileRecord {
  id: string
  user_id: string
  project_id: string | null
  storage_path: string
  filename: string
  mime: string | null
  size: number
  meta_json: Record<string, unknown>
  ingest_status: 'none' | 'queued' | 'processing' | 'done' | 'failed'
  ingest_error: string | null
  created_at: string
}

export interface FileChunk {
  id: string
  file_id: string
  project_id: string | null
  user_id: string
  chunk_index: number
  page: number | null
  content: string
  content_hash: string | null
  meta_json: Record<string, unknown>
  created_at: string
  similarity?: number
}

export interface MemoryItem {
  id?: string
  content: string
  enabled?: boolean
}

export interface Memory {
  id: string
  user_id: string
  project_id: string | null
  conversation_id: string | null
  content: string
  scope: 'user' | 'project' | 'conversation'
  enabled: boolean
  created_at: string
}

export interface FileAttachment {
  file_id: string
  filename: string
  mime: string
  size: number
  storage_path: string
}

export interface ChunkSource {
  chunk_id: string
  file_id: string
  filename: string
  page?: number
  chunk_index: number
  snippet: string
  similarity: number
  // Web search fields (when source_type === 'web')
  url?: string
  source_type?: 'rag' | 'web'
}

export interface WebSource {
  title: string
  url: string
  snippet: string
}

export interface ModelOption {
  id: string
  name: string
  provider: string
  maxTokens: number
}

export const MODELS: ModelOption[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', maxTokens: 128000 },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', maxTokens: 128000 },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', maxTokens: 128000 },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', maxTokens: 16385 },
]

export interface AIProvider {
  id: string
  name: string
  type: string
  base_url: string
  api_key: string
  is_enabled: boolean
  priority: number
  created_at: string
  updated_at: string
}

export interface ModelConfig {
  id: string
  provider_id: string
  model_id: string
  display_name: string
  description: string
  icon_url: string
  system_prompt: string
  is_visible: boolean
  sort_order: number
  max_tokens: number
  use_max_tokens: boolean
  supports_streaming: boolean
  supports_vision: boolean
  created_at: string
  updated_at: string
  // joined
  provider_name?: string
  provider_type?: string
}

export interface DbConnection {
  id: string
  name: string
  description: string
  db_type: string
  host: string
  port: number
  database_name: string
  username: string
  password: string
  is_active: boolean
  schema_cache: DbSchemaTable[]
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface DbSchemaTable {
  table_name: string
  schema_name: string
  columns: { name: string; type: string; nullable: boolean }[]
}

export interface NetworkDrive {
  id: string
  name: string
  description: string
  unc_path: string
  is_active: boolean
  file_extensions: string[]
  max_file_size_mb: number
  file_count: number
  total_chunks: number
  last_synced_at: string | null
  sync_status: 'idle' | 'syncing' | 'done' | 'error'
  sync_error: string | null
  created_at: string
  updated_at: string
}

export interface NetworkFile {
  id: string
  drive_id: string
  file_path: string
  filename: string
  extension: string | null
  file_size: number
  mime_type: string | null
  last_modified: string | null
  indexed_at: string
  chunk_count: number
  char_count: number
  status: 'pending' | 'processing' | 'done' | 'failed' | 'skipped'
  error_message: string | null
  content_hash: string | null
  created_at: string
  updated_at: string
}

