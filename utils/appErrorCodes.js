// errors.js
const ErrorCodes = {
  INVALID_GOOGLE_ID: {
    code: 'AUTH001',
  },
  NO_GOOGLE_ID_TOKEN_PROVIDED: {
    code: 'AUTH002',
  },
  INVALID_APPLE_ID: {
    code: 'AUTH003',
  },
  NO_APPLE_ID_TOKEN_PROVIDED: {
    code: 'AUTH004',
  },
  NO_EMAIL_PROVIDED: {
    code: 'AUTH005',
  },
  EMAIL_SENDING_ERROR: {
    code: 'AUTH006',
  },
  INVALID_OR_EXPIRED_VERIFICATION_CODE: {
    code: 'AUTH007',
  },
  INVALID_VERIFICATION_CODE: {
    code: 'AUTH008',
  },
  NOT_LOGGED_IN: {
    code: 'AUTH009',
  },
  NO_USER_BELONGING_TO_TOKEN: {
    code: 'AUTH010',
  },
  UNAUTHORIZED: {
    code: 'USER001',
  },
  MIN_AGE_RESTRICTION: {
    code: 'USER002',
  },
  MIN_ORDER_AMOUNT_RESTRICTION: {
    code: 'ORDER003',
  },
  USER_ID_NOT_VERIFIED: {
    code: 'ORDER004',
  },
  OUT_OF_STOCK: {
    code: 'ORDER005',
  },
  NO_NEAREST_FULLFILMENT_CENTER_FOUND: {
    code: 'ORDER006',
  },
};

module.exports = ErrorCodes;
