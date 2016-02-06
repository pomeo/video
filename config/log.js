const moment = require('moment');
const options = {
  'console': {
    colorize: true,
    timestamp: () => {
      return `${moment(new Date()).format('DD/MM/YYYY HH:mm:ss.SSS')}`;
    },
  },
};

module.exports = {
  production: options,
  development: options,
};
