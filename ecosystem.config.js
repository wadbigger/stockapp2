module.exports = {
  apps: [{
    name: 'stockapp',
    script: 'dist/index.js',
    cwd: __dirname + '/backend',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    watch: false,
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: __dirname + '/logs/error.log',
    out_file: __dirname + '/logs/output.log',
    merge_logs: true,
  }]
};
