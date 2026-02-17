import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceRoleClient()
  const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return { user, service }
}

function generateInvitationToken(): string {
  return randomBytes(32).toString('hex')
}

// GET: List all invitations
export async function GET() {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { data: invitations, error } = await auth.service
      .from('user_invitations')
      .select('*, invited_by_profile:invited_by(name), group:group_id(name)')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ invitations })
  } catch (error) {
    console.error('Error fetching invitations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Create new invitation
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { email, role, groupId, expiresInHours } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'email required' }, { status: 400 })
    }

    // Check if user already exists
    const { data: existingProfile } = await auth.service
      .from('profiles')
      .select('id')
      .eq('id', email)
      .maybeSingle()

    if (existingProfile) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 })
    }

    const token = generateInvitationToken()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + (expiresInHours || 48))

    const { data: invitation, error } = await auth.service
      .from('user_invitations')
      .insert({
        email,
        token,
        invited_by: auth.user.id,
        group_id: groupId || null,
        role: role || 'user',
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // TODO: Send invitation email
    // const invitationUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/accept-invitation?token=${token}`

    // Log audit action
    await auth.service.from('admin_audit_log').insert({
      admin_user_id: auth.user.id,
      action: 'invitation_sent',
      details: { email, role, group_id: groupId },
    })

    return NextResponse.json({ invitation })
  } catch (error) {
    console.error('Error creating invitation:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH: Resend or cancel invitation
export async function PATCH(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { invitationId, action } = await req.json()

    if (!invitationId || !action) {
      return NextResponse.json({ error: 'invitationId and action required' }, { status: 400 })
    }

    if (action === 'resend') {
      // Extend expiration
      const newExpiresAt = new Date()
      newExpiresAt.setHours(newExpiresAt.getHours() + 48)

      const { error } = await auth.service
        .from('user_invitations')
        .update({
          expires_at: newExpiresAt.toISOString(),
          status: 'pending',
        })
        .eq('id', invitationId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // TODO: Resend invitation email

      return NextResponse.json({ success: true, message: 'Invitation resent' })
    } else if (action === 'cancel') {
      const { error } = await auth.service
        .from('user_invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitationId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: 'Invitation cancelled' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error updating invitation:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

