// PM2 进程配置文件
// 用法: pm2 start ecosystem.config.js --env production

module.exports = {
  apps: [
    {
      name: "imwallet",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env_production: {
        NODE_ENV: "production",
      },
      // 日志配置
      error_file: "/var/log/imwallet/error.log",
      out_file: "/var/log/imwallet/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      // 重启策略
      min_uptime: "10s",
      max_restarts: 15,
      restart_time: 5000,
    },
  ],
};
