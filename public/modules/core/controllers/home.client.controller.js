
'use strict';

angular.module('core').controller('HomeController',
  [
    '$scope',
    'tweeterSocket',
    function ($scope, tweeterSocket) {
      $scope.twitterData = [];

      var tweetsAppend = function (data) {
        $scope.twitterData.push(data);
      };

      var teetsPrepend = function (data) {
        $scope.twitterData.unshift(data);
      };

      $scope.containMedia = function(media) {
        return !_.isEmpty(media);
      };

      tweeterSocket.on('twitter_feed:new', teetsPrepend);
      tweeterSocket.on('twitter_feed:history', tweetsAppend);
    }
  ]
);

