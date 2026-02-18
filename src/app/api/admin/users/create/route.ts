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
  return { user, service, supabase }
}

function generateTemporaryPassword(): string {
  // Generate a secure random password
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*'
  let password = ''
  const randomValues = randomBytes(12)
  for (let i = 0; i < 12; i++) {
    password += chars[randomValues[i] % chars.length]
  }
  return password
}

// POST: Create new user with temporary password and send invitation email
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { email, name, role, password } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'email required' }, { status: 400 })
    }

    // Check if user already exists
    const { data: existingUser } = await auth.service.auth.admin.listUsers()
    const userExists = existingUser.users.some((u: { email: string }) => u.email === email)

    if (userExists) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 })
    }

    // Use provided password or generate temporary password
    const temporaryPassword = password || generateTemporaryPassword()
    const isCustomPassword = !!password

    // Create user in Supabase Auth
    const { data: newUser, error: createError } = await auth.service.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        name: name || email.split('@')[0],
      },
    })

    if (createError || !newUser.user) {
      console.error('Error creating user:', createError)
      return NextResponse.json({ error: createError?.message || 'Failed to create user' }, { status: 500 })
    }

    console.log('✅ User created in auth.users:', newUser.user.id)

    // Wait a bit for the trigger to create the profile
    await new Promise(resolve => setTimeout(resolve, 100))

    // Update the profile that was auto-created by the trigger
    // The trigger creates the profile with default values, we need to update the role and name
    const profileData = {
      name: name || email.split('@')[0],
      role: role || 'user',
    }

    console.log('📝 Updating profile with:', profileData)

    const { error: profileError } = await auth.service
      .from('profiles')
      .update(profileData)
      .eq('id', newUser.user.id)

    if (profileError) {
      console.error('❌ Error updating profile:', profileError)
      console.error('Profile error details:', JSON.stringify(profileError, null, 2))
      // Rollback: delete the auth user (cascade will delete the profile)
      await auth.service.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({
        error: 'Failed to update user profile',
        details: profileError.message,
        code: profileError.code,
        hint: profileError.hint
      }, { status: 500 })
    }

    console.log('✅ Profile updated successfully')

    // Send invitation email with credentials (only if password was auto-generated)
    let inviteLink = ''
    let emailSent = false

    if (!isCustomPassword) {
      try {
        // Generate invite link using Supabase Auth
        const { data: inviteData, error: inviteError } = await auth.service.auth.admin.inviteUserByEmail(email, {
          data: {
            password: temporaryPassword,
            name: name || email.split('@')[0],
          },
          redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://gia.fgarola.es'}/auth/callback`,
        })

        if (inviteError) {
          console.error('❌ Error sending invite email:', inviteError)
        } else {
          console.log('✅ Invite email sent successfully')
          emailSent = true
          inviteLink = inviteData?.properties?.action_link || `${process.env.NEXT_PUBLIC_SITE_URL || 'https://gia.fgarola.es'}/auth/login`
        }
      } catch (emailError) {
        console.error('❌ Exception sending invite email:', emailError)
      }
    }

    // Log audit action
    await auth.service.from('admin_audit_log').insert({
      admin_user_id: auth.user.id,
      action: 'user_created',
      details: { user_id: newUser.user.id, email, name, customPassword: isCustomPassword, emailSent },
    })

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.user.id,
        email,
        name: name || email.split('@')[0],
      },
      temporaryPassword: isCustomPassword ? undefined : temporaryPassword, // Only return if auto-generated
      resetLink: isCustomPassword ? undefined : inviteLink,
      emailSent,
      message: isCustomPassword
        ? 'Usuario creado con contraseña personalizada'
        : emailSent
          ? 'Usuario creado y email de invitación enviado'
          : 'Usuario creado con contraseña temporal',
    })
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

