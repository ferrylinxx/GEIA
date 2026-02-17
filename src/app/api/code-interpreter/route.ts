import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { spawn } from 'child_process'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const TIMEOUT_MS = 30000 // 30 seconds max execution time
const MAX_OUTPUT_SIZE = 1024 * 1024 // 1MB max output

interface ExecutionResult {
  success: boolean
  output?: string
  error?: string
  execution_time_ms?: number
  files?: Array<{ filename: string; content: string; mime: string }>
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { code, conversation_id, message_id } = body

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 })
    }

    // Security checks
    const dangerousPatterns = [
      /import\s+os/i,
      /import\s+subprocess/i,
      /import\s+sys/i,
      /exec\s*\(/i,
      /eval\s*\(/i,
      /__import__/i,
      /open\s*\(/i,
      /file\s*\(/i,
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        return NextResponse.json({
          error: 'Código no permitido: contiene operaciones restringidas por seguridad',
        }, { status: 400 })
      }
    }

    // Create execution record
    const { data: execution, error: insertError } = await supabase
      .from('code_executions')
      .insert({
        user_id: user.id,
        conversation_id,
        message_id,
        code,
        language: 'python',
        status: 'running',
      })
      .select()
      .single()

    if (insertError || !execution) {
      console.error('[CodeInterpreter] Failed to create execution record:', insertError)
      return NextResponse.json({ error: 'Failed to create execution record' }, { status: 500 })
    }

    // Execute code in sandbox
    const result = await executeCodeSafely(code)

    // Update execution record
    await supabase
      .from('code_executions')
      .update({
        output: result.output,
        error: result.error,
        status: result.success ? 'completed' : 'failed',
        execution_time_ms: result.execution_time_ms,
        updated_at: new Date().toISOString(),
      })
      .eq('id', execution.id)

    return NextResponse.json({
      success: result.success,
      output: result.output,
      error: result.error,
      execution_time_ms: result.execution_time_ms,
      files: result.files,
    })
  } catch (error) {
    console.error('[CodeInterpreter] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 })
  }
}

async function executeCodeSafely(code: string): Promise<ExecutionResult> {
  const startTime = Date.now()
  const sessionId = randomUUID()
  const tempDir = join(tmpdir(), `code-exec-${sessionId}`)
  const scriptPath = join(tempDir, 'script.py')

  try {
    // Create temp directory
    await mkdir(tempDir, { recursive: true })

    // Wrap code with safety restrictions
    const wrappedCode = `
import sys
import io
import json
import base64
from contextlib import redirect_stdout, redirect_stderr

# Restricted imports only
import math
import random
import datetime
import json
import re
import statistics

# Data analysis libraries (if available)
try:
    import numpy as np
    import pandas as pd
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend
    import matplotlib.pyplot as plt
except ImportError:
    pass

# Capture stdout/stderr
stdout_capture = io.StringIO()
stderr_capture = io.StringIO()

try:
    with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
${code.split('\n').map(line => '        ' + line).join('\n')}
except Exception as e:
    print(f"Error: {type(e).__name__}: {str(e)}", file=sys.stderr)

print(json.dumps({
    "stdout": stdout_capture.getvalue(),
    "stderr": stderr_capture.getvalue()
}))
`

    await writeFile(scriptPath, wrappedCode, 'utf-8')

    // Execute with timeout
    const result = await new Promise<ExecutionResult>((resolve) => {
      let stdout = ''
      let stderr = ''
      let timedOut = false

      const child = spawn('python3', [scriptPath], {
        cwd: tempDir,
        timeout: TIMEOUT_MS,
      })

      const timeout = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        resolve({
          success: false,
          error: `Execution timeout (${TIMEOUT_MS / 1000}s exceeded)`,
          execution_time_ms: Date.now() - startTime,
        })
      }, TIMEOUT_MS)

      child.stdout.on('data', (data) => {
        stdout += data.toString()
        if (stdout.length > MAX_OUTPUT_SIZE) {
          child.kill('SIGTERM')
        }
      })

      child.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      child.on('close', (exitCode) => {
        clearTimeout(timeout)
        if (timedOut) return

        const execution_time_ms = Date.now() - startTime

        try {
          // Try to parse JSON output
          const lastLine = stdout.trim().split('\n').pop() || ''
          const parsed = JSON.parse(lastLine)

          resolve({
            success: exitCode === 0,
            output: parsed.stdout || '',
            error: parsed.stderr || (exitCode !== 0 ? `Exit code: ${exitCode}` : undefined),
            execution_time_ms,
          })
        } catch {
          // Fallback to raw output
          resolve({
            success: exitCode === 0,
            output: stdout,
            error: stderr || (exitCode !== 0 ? `Exit code: ${exitCode}` : undefined),
            execution_time_ms,
          })
        }
      })
    })

    return result
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      execution_time_ms: Date.now() - startTime,
    }
  } finally {
    // Cleanup
    try {
      await unlink(scriptPath)
    } catch {
      // Ignore cleanup errors
    }
  }
}

