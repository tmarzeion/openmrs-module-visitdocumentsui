angular.module('vdui.widget.thumbnail')

.config(['$compileProvider', function ($compileProvider) {
  /* Prevent Angular from throwing error when querying images using 'data' protocol */
  $compileProvider.imgSrcSanitizationWhitelist(/^\s*(https?|local|data):/);
}])

.directive('vduiEnterKeyDown', function() {
  return function(scope, element, attrs) {
    element.bind("keydown keypress", function(event) {
      if(event.which === 13) {
        scope.$apply(function() {
          scope.$eval(attrs.vduiEnterKeyDown, {'event': event});
        });
        event.preventDefault();
      }
    });
  };
})

.directive('vduiEscapeKeyDown', function() {
  return function(scope, element, attrs) {
    element.bind("keydown keypress", function(event) {
      if(event.which === 27) {
        scope.$apply(function() {
          scope.$eval(attrs.vduiEscapeKeyDown, {'event': event});
        });
        event.preventDefault();
      }
    });
  };
})

.directive('vduiThumbnail', ['VisitDocument', 'ComplexObsCacheService', 'ModuleUtils', 'ngDialog', '$http', '$window', '$sce', function(VisitDocument, obsCache, module, ngDialog, $http, $window, $sce) {
  return {
    restrict: 'E',
    scope: {
      obs: '=',
      config: '='
    },
    templateUrl: '/' + module.getPartialsPath(OPENMRS_CONTEXT_PATH) + '/thumbnail.html',

    controller: function($scope) {

      var msgCodes = [
        module.getProvider() + ".misc.label.enterCaption",
        module.getProvider() + ".thumbail.get.error",
        module.getProvider() + ".thumbail.save.success",
        module.getProvider() + ".thumbail.save.error",
        module.getProvider() + ".thumbail.delete.success",
        module.getProvider() + ".thumbail.delete.error",
        module.getProvider() + ".visitdocumentspage.delete.title",
        module.getProvider() + ".visitdocumentspage.delete.confirm",
        "coreapps.yes",
        "coreapps.no"
      ]
      emr.loadMessages(msgCodes.toString(), function(msgs) {
        $scope.msgs = msgs;
      });
      moment.locale($scope.config.locale);

      $scope.canEdit = function() {
        if($scope.config.canEdit) {
          if($scope.config.canEdit === true) {
            return true;
          }
        }
        return false;
      }

      $scope.toggleVisible = function(visible) {
        $scope.active = visible;
      }

      $scope.toggleEditMode = function(editMode) {
        $scope.typedText = {};
        if ($scope.canEdit()) {
          $scope.typedText.newCaption = $scope.obs.comment;
          $scope.editMode = editMode;
          if ($scope.editMode) {
            $scope.editModeCss = "vdui_thumbnail-edit-mode";
          }
          else {
            $scope.editModeCss = "";
          }
        }
      }

      $scope.toggleEditMode(false);
      $scope.toggleVisible(true);
      $scope.src = "";
      $scope.loading = false;

      $scope.getEditModeCss = function() {
        return $scope.editModeCss;
      }

      $scope.getPrettyDate = function() {
        var timeFormat = "DD MMM YY";
        var now = new moment();
        var obsDate = moment($scope.obs.obsDatetime);  // new Date(..) would throw 'Invalid date' on Apple WebKit
        if ( ( obsDate.year() == now.year() ) && ( obsDate.dayOfYear() == now.dayOfYear() ) ) {
          timeFormat = "HH:mm";
        }
        else {
          if (obsDate.year() === now.year()) {
            timeFormat = "DD MMM";
          }
        }
        return moment(obsDate).format(timeFormat);
      }

      $scope.saveCaption = function() {

        var caption = $scope.obs.comment;
        if ((caption == $scope.typedText.newCaption) || ($scope.typedText.newCaption == "" && !$scope.config.allowNoCaption)) {
          $scope.toggleEditMode(false);
          return;
        }

        $scope.obs.comment = $scope.typedText.newCaption;

        var saved = VisitDocument.save({
          uuid: $scope.obs.uuid,
          comment: $scope.obs.comment
        });
        saved.$promise.then(function(visitDoc) {
          $scope.obs.uuid = visitDoc.uuid;
          $scope.toggleEditMode(false);
          emr.successMessage(module.getProvider() + ".thumbail.save.success");
        }, function(err) {
          $scope.obs.comment = caption;
          emr.errorMessage(module.getProvider() + ".thumbail.save.error");
          console.log(err);
        });
      }

      $scope.confirmDelete = function() {
        // https://github.com/likeastore/ngDialog/blob/master/README.md
        ngDialog.open({
          template: '/' + module.getPartialsPath(OPENMRS_CONTEXT_PATH) + '/deleteDialog.html',
          scope: $scope,
          controller: ['$scope', function($scope) {
            $scope.showSpinner = false;
            $scope.confirm = function() {
              $scope.showSpinner = true;
              $scope.purge(true, $scope);
            }
          }]
        });
      }

      $scope.purge = function(purge, scope) {
        VisitDocument.delete({
          uuid: scope.obs.uuid,
          purge: purge
        })
        .$promise.then(function(res) {
          scope.toggleVisible(false);
          scope.closeThisDialog();
          emr.successMessage(module.getProvider() + ".thumbail.delete.success");
        }, function(err) {
          scope.closeThisDialog();
          if (purge === true) { // We should only do this if error 500 is the cause: https://github.com/openmrs/openmrs-core/blob/1.11.x/api/src/main/java/org/openmrs/api/impl/ObsServiceImpl.java#L213
            scope.purge(null, scope);
          }
          else {
            emr.errorMessage(module.getProvider() + ".thumbail.delete.error");
            console.log(err);
          }
        }); 
      }

      /*
        Injects the icon's HTML into the DOM. We had to avoid an in-DOM ng-if (or ng-switch) due to performance issues.
      */
      var setIconHtml = function(complexObs) {
        var html = "";
        switch (complexObs.contentFamily) {
          case module.family.IMAGE:
            html =  '<img src="' +
                    'data:' + complexObs.mimeType + ';base64,' + module.arrayBufferToBase64(complexObs.complexData) +
                    '"/>';
            break;

          case module.family.PDF:
            html =  '<i class="icon-file-pdf-o"></i>' +
                    '<span class="vdui_thumbnail-extension">' + complexObs.contentFamily.toUpperCase() + '</span>';
            break;

          case module.family.OTHER:
          default:
            html =  '<i class="icon-file"></i>' +
                    '<span class="vdui_thumbnail-extension">.' + complexObs.fileExt + '</span>';
            break;
        }
        $scope.iconHtml = $sce.trustAsHtml(html);
      }

      $scope.init = function() {
        $scope.displayDefaultContentFamily = true;

        obsCache.getComplexObs($scope.obs, $scope.config.downloadUrl, $scope.config.thumbView)
        .then(function(res) {
          $scope.loading = false;
          $scope.obs = res.obs;
          $scope.obs.complexData = res.complexData; // Turning the obs into a complex obs.
          setIconHtml($scope.obs);
        }, function(err) {
          $scope.loading = false;
          emr.errorMessage(module.getProvider() + ".thumbail.get.error");
          console.log(err);
        });
      }

      $scope.displayContent = function() {
        var win = getWindow($scope.obs.contentFamily);

        $scope.loading = true;
        obsCache.getComplexObs($scope.obs, $scope.config.downloadUrl, $scope.config.originalView)
        .then(function(res) {
          $scope.loading = false;
          switch ($scope.obs.contentFamily) {
            case module.family.IMAGE:
              displayImage($scope.obs, res.complexData);
              break;

            case module.family.PDF:
              displayPdf($scope.obs, res.complexData, win);
              break;

            case module.family.OTHER:
            default:
              displayOther($scope.obs, res.complexData);
              break;
          }
        }, function(err) {
          $scope.loading = false;
          emr.errorMessage(module.getProvider() + ".thumbail.get.error");
          console.log(err);
        });
      }

      var displayImage = function(obs, data) {
        $scope.imageConfig = {};
        $scope.imageConfig.bytes = module.arrayBufferToBase64(data);
        $scope.imageConfig.mimeType = obs.mimeType;
        $scope.imageConfig.caption = obs.comment;
      }

      var displayPdf = function(obs, data, win) {
        var blob = new Blob([data], {type: obs.mimeType});
        var blobUrl = URL.createObjectURL(blob);
        win.location.href = blobUrl;
      }

      var displayOther = function(obs, data) {   // http://stackoverflow.com/a/28541187/321797
        var blob = new Blob([data], {type: obs.mimeType});
        var downloadLink = angular.element('<a></a>');
        downloadLink.attr('href', $window.URL.createObjectURL(blob));
        downloadLink.attr('download', obs.fileName);
        downloadLink[0].click();
      }

      var getWindow = function(contentFamily) {
        switch ($scope.obs.contentFamily) {
          case module.family.PDF:
          return $window.open('');
          default:
          return {};
        }
      }
    }
  };
}]);