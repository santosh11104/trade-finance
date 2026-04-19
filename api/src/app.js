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
const { db, initDb } = require('./db');
const caClient = require('./caClient');
const AuthController = require('./controllers/authController');
const lcRoutes = require('./routes/lc');
const eventListener = require('./eventListener');
const swagger = require('./swagger');
const PostgresRepository = require('./repositories/postgresRepository');
const { seedDatabase } = require('./seeder');

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
  max: 10, // limit each auth requests per hour
  message: { error: 'Too many authentication attempts, please try again after an hour.' }
});

app.use(generalLimiter);

// Swagger documentation
app.use('/api-docs', swagger.serve, swagger.setup);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Use pg-promise simple query for health check
    await db.one('SELECT 1');
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
  }),
  enroll: Joi.object({
    username: Joi.string().required(),
    role: Joi.string().valid('importer', 'exporter', 'bank', 'admin').required(),
    orgMsp: Joi.string().valid('Org1MSP', 'Org2MSP', 'Org3MSP', 'Org4MSP').required(),
    secret: Joi.string().required()
  })
};

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  next();
};

// Joi Validation Schemas for Auth

// User registration (admin only)
app.post('/auth/register', authLimiter, authorize, permit('admin'), validate(schemas.register), async (req, res) => {
  const { username, password, role, orgMsp } = req.body;

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await PostgresRepository.createUser({
      username,
      passwordHash,
      role,
      orgMsp
    });

    try {
      await caClient.registerAndEnrollUser(username, role, orgMsp);
    } catch (caErr) {
      console.error(`Fabric CA registration failed for ${username}:`, caErr);
      return res.status(500).json({ error: `User created in DB but Fabric CA registration failed: ${caErr.message}` });
    }

    res.status(201).json({
      success: true,
      message: 'user created successfully and enrolled with Fabric CA',
      user: user
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'username already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// User login
app.post('/auth/login', authLimiter, validate(schemas.login), async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await PostgresRepository.findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

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
    await initDb();
    await caClient.enrollAllAdmins();
    await seedDatabase();
    await eventListener.startEventListener();
    app.listen(config.port, () => {
      console.log(`Trade Finance API listening on port ${config.port}`);
    });
  } catch (err) {
    console.error('Failed to start API', err);
    process.exit(1);
  }
};

start();
