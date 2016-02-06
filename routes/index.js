'use strict';
const express  = require('express');
const router   = new express.Router();
const log      = require('winston-logs')(require('../config/log'));


router.get('/', (req, res) => {
  res.render('index', {
    title: 'Express',
  });
});

module.exports = router;
