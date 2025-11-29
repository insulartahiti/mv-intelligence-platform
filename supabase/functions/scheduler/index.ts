import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mv-signature',
}

interface SchedulerResult {
  executed_tasks: string[];
  skipped_tasks: string[];
  errors: string[];
  next_run: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { schedule_type = 'daily' } = await req.json()
    
    console.log(`Running scheduler for: ${schedule_type}`)

    const result: SchedulerResult = {
      executed_tasks: [],
      skipped_tasks: [],
      errors: [],
      next_run: ''
    }

    const now = new Date()
    const baseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const webhookSecret = Deno.env.get('MV_WEBHOOK_SECRET') || ''

    // Define tasks based on schedule type
    const tasks = getTasksForSchedule(schedule_type, now)

    for (const task of tasks) {
      try {
        console.log(`Executing task: ${task.name}`)
        
        const response = await fetch(`${baseUrl}/functions/v1/${task.function}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            'x-mv-signature': webhookSecret
          },
          body: JSON.stringify(task.payload)
        })

        const taskResult = await response.json()
        
        if (taskResult.ok) {
          result.executed_tasks.push(task.name)
          console.log(`✅ ${task.name} completed successfully`)
        } else {
          result.errors.push(`${task.name}: ${taskResult.error}`)
          console.error(`❌ ${task.name} failed:`, taskResult.error)
        }
      } catch (error) {
        result.errors.push(`${task.name}: ${error.message}`)
        console.error(`❌ ${task.name} error:`, error)
      }
    }

    // Calculate next run time
    result.next_run = getNextRunTime(schedule_type, now).toISOString()

    // Update scheduler metadata
    await updateSchedulerMetadata(supabaseClient, schedule_type, result)

    return new Response(
      JSON.stringify({ 
        ok: true, 
        ...result,
        timestamp: now.toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Scheduler error:', error)
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function getTasksForSchedule(scheduleType: string, now: Date) {
  const tasks = []

  switch (scheduleType) {
    case 'realtime':
      // Real-time tasks (triggered by events)
      tasks.push({
        name: 'Process new interactions',
        function: 'process-new-interactions',
        payload: { trigger: 'realtime' }
      })
      break

    case 'near_realtime':
      // Every 15-30 minutes
      tasks.push(
        {
          name: 'Sync Affinity data',
          function: 'sync-affinity-data',
          payload: { sync_type: 'incremental' }
        },
        {
          name: 'Process new emails',
          function: 'process-email-sentiment',
          payload: { since: new Date(now.getTime() - 30 * 60 * 1000).toISOString() }
        }
      )
      break

    case 'daily':
      // Daily batch updates
      tasks.push(
        {
          name: 'Full Affinity sync',
          function: 'sync-affinity-data',
          payload: { sync_type: 'full' }
        },
        {
          name: 'Batch intelligence update',
          function: 'batch-intelligence-update',
          payload: { update_type: 'stale', limit: 100 }
        },
        {
          name: 'Recalculate relationship scores',
          function: 'recalculate-relationship-scores',
          payload: { update_type: 'all' }
        },
        {
          name: 'Identify new opportunities',
          function: 'identify-opportunities',
          payload: { analysis_type: 'daily' }
        }
      )
      break

    case 'weekly':
      // Weekly deep updates
      tasks.push(
        {
          name: 'Full knowledge graph analysis',
          function: 'full-kg-analysis',
          payload: { analysis_type: 'comprehensive' }
        },
        {
          name: 'Market intelligence update',
          function: 'update-market-intelligence',
          payload: { update_type: 'weekly' }
        },
        {
          name: 'Competitive landscape analysis',
          function: 'competitive-analysis',
          payload: { analysis_type: 'weekly' }
        },
        {
          name: 'Strategic opportunity assessment',
          function: 'strategic-assessment',
          payload: { assessment_type: 'weekly' }
        }
      )
      break
  }

  return tasks
}

function getNextRunTime(scheduleType: string, now: Date): Date {
  switch (scheduleType) {
    case 'realtime':
      return new Date(now.getTime() + 1 * 60 * 1000) // 1 minute
    case 'near_realtime':
      return new Date(now.getTime() + 30 * 60 * 1000) // 30 minutes
    case 'daily':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 hours
    case 'weekly':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days
    default:
      return new Date(now.getTime() + 60 * 60 * 1000) // 1 hour default
  }
}

async function updateSchedulerMetadata(supabaseClient: any, scheduleType: string, result: SchedulerResult) {
  const { error } = await supabaseClient
    .from('batch_run_metadata')
    .upsert({
      id: `scheduler_${scheduleType}`,
      last_run: new Date().toISOString(),
      status: result.errors.length > 0 ? 'partial_success' : 'completed',
      details: {
        executed_tasks: result.executed_tasks,
        skipped_tasks: result.skipped_tasks,
        errors: result.errors,
        next_run: result.next_run
      }
    }, {
      onConflict: 'id'
    })

  if (error) {
    console.error('Error updating scheduler metadata:', error)
  }
}
