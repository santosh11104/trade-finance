const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const config = require('./config');
const { signToken, authorize } = require('./auth');
const db = require('./db');
const lcRoutes = require('./routes/lc');
const eventListener = require('./eventListener');

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const userResult = await db.query('SELECT username, role, org_msp FROM users WHERE username=$1', [username]);
    if (!userResult.rows.length) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const user = userResult.rows[0];
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
