'use strict';
const mongoose = require('mongoose');
const as  = require('async');
const moment = require('moment');
const country = require('./libs/country');
const fs  = require('fs');
const log = require('winston-logs')(require('./config/log'));

const modelsPath = `${__dirname}/models`;
fs.readdirSync(modelsPath).forEach(file => {
  if (~file.indexOf('js')) {
    require(`${modelsPath}/${file}`);
  }
});

const Tasks  = mongoose.model('Tasks');

let count = 0;

as.whilst(
  () => {
    return count < 558;
  },
  callback => {
    as.forEach(Object.keys(country), (item, cb) => {
      const task = new Tasks({
        type: 1,
        status: 1,
        country: item,
        date: moment('20140801').add(count, 'day').format('YYYYMMDD'),
        created_at: new Date(),
        updated_at: new Date(),
      });
      task.save(err => {
        cb();
      });
    }, err => {
      count++;
      callback(null, count);
    });
  },
  (err, n) => {
    log.info('Finish');
  }
);

mongoose.connect(`mongodb://${process.env.mongo}/video`);
