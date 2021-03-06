var _ = require('lodash');
var request = require('request');

var RemoteException = exports.RemoteException = require('./remoteexception.js');

var WebHDFSClient = exports.WebHDFSClient = function (options) {

    // save specified options
    this.options = _.defaults(options || {}, {

        user: 'webuser',
        namenode_port: 50070,
        namenode_host: 'localhost',
        path_prefix: '/webhdfs/v1',
        high_availability: false,
        default_backoff_period_ms: 500
    });

    if (Array.isArray(this.options.namenode_list) && this.options.namenode_list.length > 1) {
        this.options.high_availability = true
    }

    // Set up the toggles for backoff and namenode switching
    this._backoff_period_ms = this.options.default_backoff_period_ms;
    this._switchedNameNodeClient = false;
    // save formatted base api url
    this.base_url = 'http://' + this.options.namenode_host + ':' + this.options.namenode_port + this.options.path_prefix;

};

WebHDFSClient.prototype._makeBaseUrl = function () {
    this.base_url = 'http://' + this.options.namenode_host + ':' + this.options.namenode_port + this.options.path_prefix;
};

// Set up a toggle to determine if the backoff needs to be increased
WebHDFSClient.prototype._switchedNameNodeClient = false;

WebHDFSClient.prototype._changeNameNodeHost = function (callback) {
    // If the last operation resulted in a changed NameNode, double the current backoff
    if (this._switchedNameNodeClient) {
        this._backoff_period_ms = this._backoff_period_ms * 2;
    } else {
        this._switchedNameNodeClient = true;
    }
    // Wait the backoff period
    setTimeout(() => {
        var host = this.options.namenode_host;
        var list = this.options.namenode_list;
        var index = list.indexOf(host) + 1;
        //if empty start from the beginning of the
        this.options.namenode_host = list[index] ? list[index] : list[0];
        this._makeBaseUrl();
        return callback();
    }, this._backoff_period_ms)
};

var _parseResponse = exports._parseResponse = function (self, fnName, args, bodyArgs, callback, justCheckErrors){
    // forward request error
    return function(error, response, body) {
        // If a namenode process dies the connection will be refused, and if the namenode's server
        // completely dies, it will be inaccessible from this client, even if there is a successful
        // failover. Assumes namenodes provided in config are actual namenodes.
        if (error) {
            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                if (self.options.high_availability){
                    //change client
                    self._changeNameNodeHost(function () {
                        return self[fnName].apply(self, args);
                    });
                    return true;
                }
                else {
                    callback(error);
                    return true;
                }
            }
        }

        if (error) {
            callback(error);
            return true;
        }

        // exception handling
        if (typeof body === 'object' && 'RemoteException' in body) {
            if (self.options.high_availability && body.RemoteException.exception === 'StandbyException'){
                //change client
                self._changeNameNodeHost(function () {
                    return self[fnName].apply(self, args);
                });
                return true;
                //change client
            }
            else {
                callback(new RemoteException(body));
                return true;
            }
        }
        // Reset Namenode switch toggle and backoff period if the operation is successful and the
        // toggle had been on
        if (self._switchedNameNodeClient) {
            self._switchedNameNodeClient = false;
            self._backoff_period_ms = self.options.default_backoff_period_ms;
        }

        if (justCheckErrors) {
            return false;
        }
        // execute callback
        callback(null, _.get(body, bodyArgs, body));
        return true;
    }
}


// ref: http://hadoop.apache.org/common/docs/stable1/webhdfs.html#DELETE
WebHDFSClient.prototype.del = function (path, hdfsoptions, requestoptions, callback) {

    // requestoptions may be omitted
    if (callback === undefined && typeof(requestoptions) === 'function') {
        callback = requestoptions;
        requestoptions = undefined;
    }

    // hdfsoptions may be omitted
    if (callback === undefined && typeof(hdfsoptions) === 'function') {
        callback = hdfsoptions;
        hdfsoptions = undefined;
    }

    var self = this;
    var originalArgs = [path, hdfsoptions, requestoptions, callback];
    var parseResponse = _parseResponse(self, 'del', originalArgs, 'boolean', callback);

    // format request args
    var args = _.defaults({
        json: true,
        uri: this.base_url + path,
        qs: _.defaults({
            op: 'delete',
            'user.name': this.options.user
        }, hdfsoptions || {})
    }, requestoptions || {});
    // send http request
    request.del(args, parseResponse);
};


// ref: http://hadoop.apache.org/common/docs/stable1/webhdfs.html#LISTSTATUS
WebHDFSClient.prototype.listStatus = function (path, hdfsoptions, requestoptions, callback) {

    // requestoptions may be omitted
    if (callback === undefined && typeof(requestoptions) === 'function') {
        callback = requestoptions;
        requestoptions = undefined;
    }

    // hdfsoptions may be omitted
    if (callback === undefined && typeof(hdfsoptions) === 'function') {
        callback = hdfsoptions;
        hdfsoptions = undefined;
    }

    var self = this;
    var originalArgs = [path, hdfsoptions, requestoptions, callback];
    var parseResponse = _parseResponse(self, 'listStatus', originalArgs, 'FileStatuses.FileStatus', callback);

    // format request args
    var args = _.defaults({
        json:true,
        uri: this.base_url + path,
        qs: _.defaults({
            op: 'liststatus'
        }, hdfsoptions || {})
    }, requestoptions || {});
    // send http request
    request.get(args, parseResponse)
};


// ref: http://hadoop.apache.org/common/docs/stable1/webhdfs.html#GETFILESTATUS
WebHDFSClient.prototype.getFileStatus = function (path, hdfsoptions, requestoptions, callback) {

    // requestoptions may be omitted
    if (callback === undefined && typeof(requestoptions) === 'function') {
        callback = requestoptions;
        requestoptions = undefined;
    }

    // hdfsoptions may be omitted
    if (callback === undefined && typeof(hdfsoptions) === 'function') {
        callback = hdfsoptions;
        hdfsoptions = undefined;
    }

    var self = this;
    var originalArgs = [path, hdfsoptions, requestoptions, callback];
    var parseResponse = _parseResponse(self, 'getFileStatus', originalArgs, 'FileStatus', callback);

    // format request args
    var args = _.defaults({
        json: true,
        uri: this.base_url + path,
        qs: _.defaults({
            op: 'getfilestatus'
        }, hdfsoptions || {})
    }, requestoptions || {});
    // send http request
    request.get(args, parseResponse);
};


// ref: http://hadoop.apache.org/common/docs/stable1/webhdfs.html#GETCONTENTSUMMARY
WebHDFSClient.prototype.getContentSummary = function (path, hdfsoptions, requestoptions, callback) {

    // requestoptions may be omitted
    if (callback === undefined && typeof(requestoptions) === 'function') {
        callback = requestoptions;
        requestoptions = undefined;
    }

    // hdfsoptions may be omitted
    if (callback===undefined && typeof(hdfsoptions) === 'function') {
        callback = hdfsoptions;
        hdfsoptions = undefined;
    }

    var self = this;
    var originalArgs = [path, hdfsoptions, requestoptions, callback];
    var parseResponse = _parseResponse(self, 'getContentSummary', originalArgs, 'ContentSummary', callback);

    // format request args
    var args = _.defaults({
        json: true,
        uri: this.base_url + path,
        qs: _.defaults({
            op: 'getcontentsummary'
        }, hdfsoptions || {})
    }, requestoptions || {});
    // send http request
    request.get(args, parseResponse);
};


// ref: http://hadoop.apache.org/common/docs/stable1/webhdfs.html#GETFILECHECKSUM
WebHDFSClient.prototype.getFileChecksum = function (path, hdfsoptions, requestoptions, callback) {

    // requestoptions may be omitted
    if (callback === undefined && typeof(requestoptions) === 'function') {
        callback = requestoptions;
        requestoptions = undefined;
    }

    // hdfsoptions may be omitted
    if (callback === undefined && typeof(hdfsoptions) === 'function') {
        callback = hdfsoptions;
        hdfsoptions = undefined;
    }

    var self = this;
    var originalArgs = [path, hdfsoptions, requestoptions, callback];
    var parseResponse = _parseResponse(self, 'getFileChecksum', originalArgs, 'FileChecksum', callback);

    // format request args
    var args = _.defaults({
        json: true,
        uri: this.base_url + path,
        qs: _.defaults({
            op: 'getfilechecksum'
        }, hdfsoptions || {})
    }, requestoptions || {});
    // send http request
    request.get(args, parseResponse);
};


// ref: http://hadoop.apache.org/common/docs/stable1/webhdfs.html#GETHOMEDIRECTORY
WebHDFSClient.prototype.getHomeDirectory = function (hdfsoptions, requestoptions, callback) {

    // requestoptions may be omitted
    if (callback === undefined && typeof(requestoptions) === 'function') {
        callback = requestoptions;
        requestoptions = undefined;
    }

    // hdfsoptions may be omitted
    if (callback===undefined && typeof(hdfsoptions) === 'function') {
        callback = hdfsoptions;
        hdfsoptions = undefined;
    }

    var self = this;
    var originalArgs = [hdfsoptions, requestoptions, callback];
    var parseResponse = _parseResponse(self, 'getHomeDirectory', originalArgs, 'Path', callback);

    // format request args
    var args = _.defaults({
        json: true,
        uri: this.base_url,
        qs: _.defaults({
            op: 'gethomedirectory',
            'user.name': this.options.user
        }, hdfsoptions || {})
    }, requestoptions || {});
    // send http request
    request.get(args, parseResponse);
};

// ref: http://hadoop.apache.org/common/docs/stable1/webhdfs.html#OPEN
WebHDFSClient.prototype.open = function (path, hdfsoptions, requestoptions, callback) {

    // requestoptions may be omitted
    if (callback === undefined && typeof(requestoptions) === 'function') {
        callback = requestoptions;
        requestoptions = undefined;
    }

    // hdfsoptions may be omitted
    if (callback === undefined && typeof(hdfsoptions) === 'function') {
        callback = hdfsoptions;
        hdfsoptions = undefined;
    }

    var self = this;
    var originalArgs = [path, hdfsoptions, requestoptions, callback];
    var parseResponse = _parseResponse(self, 'open', originalArgs, null, callback);
    // format request args
    var args = _.defaults({
        json: true,
        uri: this.base_url + path,
        qs: _.defaults({
            op: 'open'
        }, hdfsoptions || {})
    }, requestoptions || {});
    // send http request
    return request.get(args, parseResponse);
};


// ref: http://hadoop.apache.org/common/docs/stable1/webhdfs.html#RENAME
WebHDFSClient.prototype.rename = function (path, destination, hdfsoptions, requestoptions, callback) {

    // requestoptions may be omitted
    if (callback === undefined && typeof(requestoptions) === 'function') {
        callback = requestoptions;
        requestoptions = undefined;
    }

    // hdfsoptions may be omitted
    if (callback === undefined && typeof(hdfsoptions) === 'function') {
        callback = hdfsoptions;
        hdfsoptions = undefined;
    }

    var self = this;
    var originalArgs = [path, hdfsoptions, requestoptions, callback];
    var parseResponse = _parseResponse(self, 'rename', originalArgs, 'boolean', callback);

    // format request args
    var args = _.defaults({
        json: true,
        uri: this.base_url + path,
        qs: _.defaults({
            op: 'rename',
            destination: destination,
            'user.name': this.options.user
        }, hdfsoptions || {})
    }, requestoptions || {});
    // send http request
    request.put(args, parseResponse);
};


// ref: http://hadoop.apache.org/common/docs/stable1/webhdfs.html#MKDIRS
WebHDFSClient.prototype.mkdirs = function (path, hdfsoptions, requestoptions, callback) {

    // requestoptions may be omitted
    if (callback === undefined && typeof(requestoptions) === 'function') {
        callback = requestoptions;
        requestoptions = undefined;
    }

    // hdfsoptions may be omitted
    if (callback === undefined && typeof(hdfsoptions) === 'function') {
        callback = hdfsoptions;
        hdfsoptions = undefined;
    }

    var self = this;
    var originalArgs = [path, hdfsoptions, requestoptions, callback];
    var parseResponse = _parseResponse(self, 'mkdirs', originalArgs, 'boolean', callback);

    // generate query string
    var args = _.defaults({
        json: true,
        uri: this.base_url + path,
        qs: _.defaults({
            op: 'mkdirs',
            'user.name': this.options.user
        }, hdfsoptions || {})
    }, requestoptions || {});
    // send http request
    request.put(args, parseResponse);
};


// ref: http://hadoop.apache.org/common/docs/stable1/webhdfs.html#APPEND
WebHDFSClient.prototype.append = function (path, data, hdfsoptions, requestoptions, callback) {

    // requestoptions may be omitted
    if (callback === undefined && typeof(requestoptions) === 'function') {
        callback = requestoptions;
        requestoptions = undefined;
    }

    // hdfsoptions may be omitted
    if (callback === undefined && typeof(hdfsoptions) === 'function') {
        callback = hdfsoptions;
        hdfsoptions = undefined;
    }

    var self = this;
    var originalArgs = [path, hdfsoptions, requestoptions, callback];
    var parseResponse = _parseResponse(self, 'append', originalArgs, null, callback, true);

    // format request args
    var args = _.defaults({
        json: true,
        followRedirect: false,
        uri: this.base_url + path,
        qs: _.defaults({
            op: 'append',
            'user.name': this.options.user
        }, hdfsoptions || {})
    }, requestoptions || {});

    // send http request
    request.post(args, function (error, response, body) {
       var handled = parseResponse(error, response, body);
       if (handled) {
           // callback already called
           return;
       }
       // check for HDFS server unreachable
       else if (! response) {
           return callback(new Error('no response'));
       }
       // check for expected redirect
       else if (response.statusCode == 307) {
            // format request args
            args = _.defaults({
                body: data,
                uri: response.headers.location
            }, requestoptions || {});

            // send http request
            request.post(args, function (error, response, body) {
                // forward request error
                var handled = parseResponse(error, response, body);
                if (handled) {
                    return;
                }
                // check for expected response
                if (response && response.statusCode == 200) {
                    return callback(null, true);
                } else {
                    return callback(new Error('expected http 200: ' + response ? response.body : response));
                }
            });
        } else {
            return callback(new Error('expected redirect'));
        }
    });
};


// ref: http://hadoop.apache.org/common/docs/stable1/webhdfs.html#CREATE
WebHDFSClient.prototype.create = function (path, data, hdfsoptions, requestoptions, callback) {

    // requestoptions may be omitted
    if (callback === undefined && typeof(requestoptions) === 'function') {
        callback = requestoptions;
        requestoptions = undefined;
    }

    // hdfsoptions may be omitted
    if (callback === undefined && typeof(hdfsoptions) === 'function') {
        callback = hdfsoptions;
        hdfsoptions = undefined;
    }

    var self = this;
    var originalArgs = [path, hdfsoptions, requestoptions, callback];
    var parseResponse = _parseResponse(self, 'create', originalArgs, null, callback, true);

    // generate query string
    var args = _.defaults({
        json: true,
        followRedirect: false,
        uri: this.base_url + path,
        qs: _.defaults({
            op: 'create',
            'user.name': this.options.user
        }, hdfsoptions || {})
    }, requestoptions || {});

    // send http request
    request.put(args, function (error, response, body) {
        // forward request error
        parseResponse(error, response, body);
        if (error) {
            // callback already called
            return;
        }
        // check for HDFS server unreachable
        else if (! response) {
            return callback(new Error('expected response for HDFS'));
        }
        // check for expected redirect
        else if (response.statusCode == 307) {
            // generate query string
            args = _.defaults({
                body: data,
                uri: response.headers.location
            }, requestoptions || {});

            // send http request
            request.put(args, function (error, response, body) {
                // forward request error
                parseResponse(error, response, body);
                if (error) {
                    return;
                }
                // check for expected created response
                if (response && response.statusCode == 201) {
                    // execute callback
                    return callback(null, response.headers.location);
                } else {
                    return callback(new Error('expected http 201 created'));
                }
            });
        } else {
            return callback(new Error('expected redirect'));
        }
    });
};
