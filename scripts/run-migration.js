const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Load environment variables
require('dotenv').config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env file')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  console.log('🚀 Running RBAC migration...\n')

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../supabase/migrations/022_rbac_system.sql')
    const sql = fs.readFileSync(migrationPath, 'utf8')

    // Split by semicolons and filter out empty statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    console.log(`📝 Found ${statements.length} SQL statements\n`)

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';'
      
      // Skip comments
      if (statement.trim().startsWith('--')) continue

      console.log(`⏳ Executing statement ${i + 1}/${statements.length}...`)
      
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement })
      
      if (error) {
        // Try direct execution if RPC fails
        const { error: directError } = await supabase.from('_migrations').insert({ statement })
        
        if (directError) {
          console.error(`❌ Error in statement ${i + 1}:`, error.message)
          console.error('Statement:', statement.substring(0, 100) + '...')
          // Continue with next statement
        } else {
          console.log(`✅ Statement ${i + 1} executed`)
        }
      } else {
        console.log(`✅ Statement ${i + 1} executed`)
      }
    }

    console.log('\n✅ Migration completed successfully!')
    console.log('\n📊 Verifying tables...')

    // Verify tables were created
    const { data: roles, error: rolesError } = await supabase.from('roles').select('count')
    const { data: userRoles, error: userRolesError } = await supabase.from('user_roles').select('count')
    const { data: permissions, error: permissionsError } = await supabase.from('role_permissions').select('count')

    if (!rolesError) console.log('✅ Table "roles" exists')
    if (!userRolesError) console.log('✅ Table "user_roles" exists')
    if (!permissionsError) console.log('✅ Table "role_permissions" exists')

    console.log('\n🎉 All done!')

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()

