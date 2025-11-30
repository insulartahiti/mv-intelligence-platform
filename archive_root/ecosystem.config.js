module.exports = {
  apps: [
    {
      name: 'ai-enrichment',
      script: 'production_ai_enrichment.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/ai-enrichment-error.log',
      out_file: './logs/ai-enrichment-out.log',
      log_file: './logs/ai-enrichment-combined.log',
      time: true
    },
    {
      name: 'system-monitor',
      script: 'system_monitor.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/monitor-error.log',
      out_file: './logs/monitor-out.log',
      log_file: './logs/monitor-combined.log',
      time: true
    }
  ]
};