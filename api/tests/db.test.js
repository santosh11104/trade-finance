const { initDb, db } = require('../src/db');

jest.mock('pg-promise', () => {
  const mDb = {
    none: jest.fn().mockResolvedValue(undefined)
  };
  const mPgp = jest.fn(() => jest.fn(() => mDb));
  return mPgp;
});

describe('DB Index', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize database schema successfully', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await initDb();
    expect(db.none).toHaveBeenCalledTimes(4);
    expect(consoleSpy).toHaveBeenCalledWith('Database schema initialized successfully');
    consoleSpy.mockRestore();
  });

  it('should throw error and log it if database initialization fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const error = new Error('DB Error');
    db.none.mockRejectedValueOnce(error);

    await expect(initDb()).rejects.toThrow('DB Error');
    expect(consoleSpy).toHaveBeenCalledWith('Error initializing database schema:', error);
    consoleSpy.mockRestore();
  });
});
