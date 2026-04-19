const AuthService = require('../services/authService');

const AuthController = {
  async enroll(req, res) {
    try {
      const result = await AuthService.enrollUser(req.body);
      res.json({
        success: true,
        message: 'User successfully enrolled in Fabric network',
        payload: result
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  }
};

module.exports = AuthController;
