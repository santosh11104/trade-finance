const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Trade Finance LC API',
      version: '1.0.0',
      description: 'REST API for Letter of Credit automation on Hyperledger Fabric',
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        LC: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'LC1001' },
            importer: { type: 'string', example: 'ImporterA' },
            exporter: { type: 'string', example: 'ExporterB' },
            issuingBank: { type: 'string', example: 'BankC' },
            advisingBank: { type: 'string', example: 'BankD' },
            amount: { type: 'number', example: 95000 },
            currency: { type: 'string', example: 'USD' },
            expiry: { type: 'string', example: '2026-12-31' },
            terms: { type: 'string', example: 'Shipment within 30 days' },
            status: { type: 'string', example: 'CREATED' },
            updatedAt: { type: 'string', example: '2026-04-14T10:00:00Z' }
          }
        }
      }
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/app.js', './src/routes/*.js'], // files containing annotations
};

const specs = swaggerJsdoc(options);

module.exports = {
  serve: swaggerUi.serve,
  setup: swaggerUi.setup(specs),
};
