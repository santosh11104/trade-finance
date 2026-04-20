const Joi = require('joi');

const validateLCCreation = (data) => {
  const schema = Joi.object({
    id: Joi.string().required(),
    importer: Joi.string().required(),
    exporter: Joi.string().required(),
    issuingBank: Joi.string().required(),
    advisingBank: Joi.string().required(),
    amount: Joi.number().positive().required(),
    currency: Joi.string().length(3).required(),
    expiry: Joi.date().iso().min(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).required()
      .messages({
        'date.min': 'Validation Error: Expiry date must be at least 30 days in the future'
      }),
    terms: Joi.string().required()
  }).unknown(true);

  const { error } = schema.validate(data);
  if (error) {
    throw new Error(error.details[0].message);
  }
};

const validateDocumentsHash = (hash) => {
  const schema = Joi.string().hex().length(64).required()
    .messages({
      'string.length': `Validation Error: Documents hash [${hash}] is invalid; expected a 64-character SHA-256 hex string`,
      'string.hex': `Validation Error: Documents hash [${hash}] is invalid; expected a 64-character SHA-256 hex string`
    });

  const { error } = schema.validate(hash);
  if (error) {
    throw new Error(error.details[0].message);
  }
};

module.exports = {
  validateLCCreation,
  validateDocumentsHash
};
