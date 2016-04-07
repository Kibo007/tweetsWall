'use strict';

angular.module('core').factory('tweeterSocket', function (socketFactory) {
  var socket = socketFactory({
    prefix: 'twitter_feed:',
    ioSocket: io.connect('http://localhost:3000/')
  });
  socket.forward('error');

  return socket;
});
