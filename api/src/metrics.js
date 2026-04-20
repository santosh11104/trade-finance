const client = require('prom-client');

// Create a Registry which registers the metrics
const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'tradefinance-api'
});

// Enable the collection of default metrics
client.collectDefaultMetrics({ register });

// Define custom metrics
const lcCreatedCounter = new client.Counter({
  name: 'lc_created_total',
  help: 'Total number of Letters of Credit created',
  labelNames: ['msp_id', 'status']
});

const lcTransactionDuration = new client.Histogram({
  name: 'lc_transaction_duration_seconds',
  help: 'Duration of LC transactions in seconds',
  labelNames: ['operation', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const activeConnections = new client.Gauge({
  name: 'active_api_connections',
  help: 'Number of active API connections'
});

// Register custom metrics
register.registerMetric(lcCreatedCounter);
register.registerMetric(lcTransactionDuration);
register.registerMetric(activeConnections);

module.exports = {
  register,
  lcCreatedCounter,
  lcTransactionDuration,
  activeConnections
};
