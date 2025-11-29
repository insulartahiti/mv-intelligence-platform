#!/usr/bin/env node

/**
 * Update database columns to support 3072 dimensions
 * This script directly updates the column types in the database
 */

const { createClient } = require('@supabase/supabase-js');

// Load environment variables from .env
const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    });
  }
}

loadEnvFile();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateColumnTypes() {
  console.log('🚀 Updating column types to support 3072 dimensions...\n');

  const updates = [
    {
      table: 'graph.entities',
      column: 'embedding',
      description: 'entities table'
    },
    {
      table: 'graph.affinity_files', 
      column: 'embedding',
      description: 'affinity_files table'
    },
    {
      table: 'graph.entity_notes_rollup',
      column: 'embedding', 
      description: 'entity_notes_rollup table'
    }
  ];

  for (const update of updates) {
    try {
      console.log(`📝 Updating ${update.description}...`);
      
      // First check if the table exists
      const { data: tableCheck, error: tableError } = await supabase
        .rpc('exec_sql', {
          sql: `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'graph' AND table_name = '${update.table.split('.')[1]}'
          );`
        });

      if (tableError) {
        console.log(`  ⚠️  Table ${update.table} might not exist, skipping...`);
        continue;
      }

      // Update the column type
      const { data, error } = await supabase
        .rpc('exec_sql', {
          sql: `ALTER TABLE ${update.table} ALTER COLUMN ${update.column} TYPE vector(3072);`
        });

      if (error) {
        console.log(`  ❌ Error updating ${update.description}: ${error.message}`);
      } else {
        console.log(`  ✅ Successfully updated ${update.description}`);
      }
    } catch (error) {
      console.log(`  ❌ Error updating ${update.description}: ${error.message}`);
    }
  }

  console.log('\n🎉 Column type updates completed!');
}

// Run the script
updateColumnTypes().catch(console.error);
