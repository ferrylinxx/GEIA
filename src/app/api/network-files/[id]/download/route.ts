import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import * as fs from 'fs'
import * as path from 'path'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'File ID required' }, { status: 400 })
    }

    // Get network file metadata
    const service = createServiceRoleClient()
    const { data: networkFile, error: fileError } = await service
      .from('network_files')
      .select('id, drive_id, file_path, filename, mime_type, file_size, status')
      .eq('id', id)
      .single()

    if (fileError || !networkFile) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Check if file is accessible (status must be 'done')
    if (networkFile.status !== 'done') {
      return NextResponse.json({ 
        error: `File not available (status: ${networkFile.status})` 
      }, { status: 400 })
    }

    // Check if drive is active
    const { data: drive, error: driveError } = await service
      .from('network_drives')
      .select('is_active')
      .eq('id', networkFile.drive_id)
      .single()

    if (driveError || !drive || !drive.is_active) {
      return NextResponse.json({ 
        error: 'Network drive not accessible or inactive' 
      }, { status: 403 })
    }

    // Security: Validate file path (prevent path traversal)
    const filePath = networkFile.file_path
    if (!filePath || filePath.includes('..') || !filePath.startsWith('\\\\')) {
      return NextResponse.json({ 
        error: 'Invalid file path' 
      }, { status: 400 })
    }

    // Check if file exists on network
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ 
        error: 'File not found on network drive' 
      }, { status: 404 })
    }

    // Read file from network path
    const fileBuffer = fs.readFileSync(filePath)
    
    // Determine MIME type
    const mimeType = networkFile.mime_type || guessMimeType(networkFile.filename)
    
    // Check if inline preview is requested
    const { searchParams } = new URL(req.url)
    const inline = searchParams.get('inline') === '1'
    
    // Set headers
    const headers = new Headers()
    headers.set('Content-Type', mimeType)
    headers.set('Content-Length', fileBuffer.length.toString())
    
    if (inline) {
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(networkFile.filename)}"`)
    } else {
      headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(networkFile.filename)}"`)
    }
    
    // Cache for 1 hour (files on network don't change often during a session)
    headers.set('Cache-Control', 'private, max-age=3600')

    return new NextResponse(fileBuffer, { headers })

  } catch (error) {
    console.error('[NetworkFileDownload] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to download file' 
    }, { status: 500 })
  }
}

function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  const mimeMap: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.html': 'text/html',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  }
  return mimeMap[ext] || 'application/octet-stream'
}

