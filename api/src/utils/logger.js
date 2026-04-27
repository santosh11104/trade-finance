const winston = require('winston');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Choose which logs to show based on environment
const level = process.env.LOG_LEVEL || 'info';

// Custom format for local development (readable)
const localFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `[${timestamp}] ${level}: ${message} ${metaString}`;
  })
);

// JSON format for Loki/Production (structured)
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const logger = winston.createLogger({
  level,
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? productionFormat : localFormat,
    }),
  ],
});

module.exports = logger;
