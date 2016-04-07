'use strict';

module.exports = function(twitter) {
  return function(req, res, next) {
    req.twitter = twitter;

    next();
  };
};
