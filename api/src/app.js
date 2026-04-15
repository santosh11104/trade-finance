const tracing = require('./tracing');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const config = require('./config');
const { signToken, authorize, permit } = require('./auth');
const db = require('./db');
const caClient = require('./caClient');
const lcRoutes = require('./routes/lc');
const eventListener = require('./eventListener');
const swagger = require('./swagger');

const app = express();

// 1. HTTP Header Security
app.use(helmet());
app.use(cors());

// 2. Payload Size Limiting
app.use(bodyParser.json({ limit: '10kb' }));

// 3. Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 auth requests per hour
  message: { error: 'Too many authentication attempts, please try again after an hour.' }
});

app.use(generalLimiter);

// Swagger documentation
app.use('/api-docs', swagger.serve, swagger.setup);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

// Joi Validation Schemas for Auth
const schemas = {
  register: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(8).required(),
    role: Joi.string().valid('importer', 'exporter', 'bank', 'admin').required(),
    orgMsp: Joi.string().valid('Org1MSP', 'Org2MSP', 'Org3MSP', 'Org4MSP').required()
  }),
  login: Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required()
  })
};

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  next();
};

// Seed database with test users (for development only)
/**
 * @openapi
 * /admin/seed:
 *   post:
 *     summary: Seed system with test data
 *     description: Seeds the database with default test users and registers them with the Fabric CA.
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Database seeded successfully
 */
app.post('/admin/seed', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password', salt);

    const users = [
      { username: 'importer1', role: 'importer', org: 'Org1MSP' },
      { username: 'exporter1', role: 'exporter', org: 'Org2MSP' },
      { username: 'bank1', role: 'bank', org: 'Org3MSP' },
      { username: 'bank2', role: 'bank', org: 'Org4MSP' },
      { username: 'admin', role: 'admin', org: 'Org1MSP' }
    ];

    for (const user of users) {
      await db.query(
        'INSERT INTO users (username, password_hash, role, org_msp) VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING',
        [user.username, passwordHash, user.role, user.org]
      );
      try {
        const enrollmentSecret = 'password';
        try {
          await caClient.registerAndEnrollUser(user.username, user.role, user.org, enrollmentSecret);
        } catch (caErr) {
          if (caErr.code === 'ALREADY_REGISTERED') {
            console.log(`User ${user.username} already registered on CA, attempting re-enrollment...`);
            await caClient.enrollUser(user.username, enrollmentSecret, user.org);
          } else {
            throw caErr;
          }
        }
      } catch (caErr) {
        console.warn(`Fabric identity setup failed for ${user.username}: ${caErr.message}`);
      }
    }

    res.json({ success: true, message: 'Database seeded with test users and Fabric identities' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User registration (admin only)
/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new user (Admin only)
 *     description: Create a new user in the database and provision identities on Fabric CA.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password, role, orgMsp]
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *               role: { type: string, enum: [importer, exporter, bank, admin] }
 *               orgMsp: { type: string, enum: [Org1MSP, Org2MSP, Org3MSP, Org4MSP] }
 *     responses:
 *       201:
 *         description: User created successfully
 */
app.post('/auth/register', authLimiter, authorize, permit('admin'), validate(schemas.register), async (req, res) => {
  const { username, password, role, orgMsp } = req.body;

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await db.query(
      'INSERT INTO users (username, password_hash, role, org_msp) VALUES ($1, $2, $3, $4) RETURNING username, role, org_msp',
      [username, passwordHash, role, orgMsp]
    );

    try {
      await caClient.registerAndEnrollUser(username, role, orgMsp);
    } catch (caErr) {
      console.error(`Fabric CA registration failed for ${username}:`, caErr);
      return res.status(500).json({ error: `User created in DB but Fabric CA registration failed: ${caErr.message}` });
    }

    res.status(201).json({
      success: true,
      message: 'user created successfully and enrolled with Fabric CA',
      user: result.rows[0]
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'username already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// User login
/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Authenticate user
 *     description: Receives a JWT token for subsequent LC operations.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, example: importer1 }
 *               password: { type: string, example: password }
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 */
app.post('/auth/login', authLimiter, validate(schemas.login), async (req, res) => {
  const { username, password } = req.body;

  try {
    const userResult = await db.query('SELECT username, password_hash, role, org_msp FROM users WHERE username=$1', [username]);
    if (!userResult.rows.length) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const user = userResult.rows[0];

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const token = signToken({ username: user.username, role: user.role, orgMsp: user.org_msp });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/lc', authorize, lcRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const start = async () => {
  try {
    await db.initDb();
    await caClient.enrollAdmin();
    await eventListener.startEventListener();
    app.listen(config.port, () => {
      console.log(`Trade Finance API listening on port ${config.port}`);
      console.log(`API Endpoints:`);
      console.log(`  POST /auth/login    - Authenticate user`);
      console.log(`  POST /lc/create     - Create LC (importer)`);
      console.log(`  POST /lc/issue      - Issue LC (importer proposes, bank approves)`);
      console.log(`  POST /lc/advise     - Advise LC (advising bank)`);
      console.log(`  POST /lc/confirm    - Confirm LC (advising bank)`);
      console.log(`  POST /lc/ship       - Submit documents (exporter)`);
      console.log(`  POST /lc/verify     - Verify documents (issuing bank)`);
      console.log(`  POST /lc/pay        - Release payment (exporter proposes, bank approves)`);
      console.log(`  POST /lc/amend      - Amend LC (importer/bank)`);
      console.log(`  POST /lc/cancel     - Cancel LC (importer/bank)`);
      console.log(`  GET  /lc/:id        - Query LC by ID`);
      console.log(`  GET  /lc/:id/history - Get LC status history`);
    });
  } catch (err) {
    console.error('Failed to start API', err);
    process.exit(1);
  }
};

start();
