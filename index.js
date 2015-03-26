var cluster = require('cluster');
var os = require('os');

module.exports = function() {
	var self = this;

	// .cluster() {{{
	/**
	* Register an async-chainable plugin to handle cluster() calls
	* @param object params The async-chainable options object
	*/
	this._plugins['cluster'] = function(params) {
		self._clusterTasks = params.payload;
		self._clusterTasksWaiting = self._clusterTasks.map(function(func, i) { return i });

		if (cluster.isMaster) {
			cluster
				.on('online', function(worker) {
					if (!self._clusterTasksWaiting.length) {
						console.warn('async-chainable-cluster: Cannot find idle task in newly spawned process. This shouldnt happen!');
						return worker.disconnect();
					}
					var taskNo = self._clusterTasksWaiting.shift();

					worker.send({
						cmd: 'acc.allocateTask',
						taskNo: taskNo
					});
				})
				.on('disconnect', function(worker) {
					if (!worker.suicide) self._clusterErr = 'Worker at PID ' + worker.process.pid + ' died';
					if (self._clusterErr || !self._clusterTasksWaiting.length) {
						// Error occured or no more tasks to run
						if (cluster.workers && Object.keys(cluster.workers).length == 0) // No more tasks running
							self._execute(self.clusterErr);
					} else {
						cluster.fork().on('message', self._clusterWorkerMessage);
						self._clusterWorkerAlloc();
					}
				});

			// Spawn however many cluster workers we need
			for (var f = 0; f < Math.min(this._clusterLimit, params.payload.length); f++)
				cluster.fork().on('message', self._clusterWorkerMessage);
		} else {
			self._clusterWorkerAlloc();
		}
	};

	this._clusterWorkerAlloc = function() {
		if (!cluster.isWorker) return; // Only act on workers

		process.on('message', function(msg) {
			if (msg.cmd == 'acc.allocateTask') {
				var task = self._clusterTasks[msg.taskNo];
				task.call(self._context, function(err, value) {
					self._clusterErr = err;
					cluster.worker.disconnect();
				});
			}
		});

		// FIXME: A future feature could be binding `Object.observe(self._context)` to auto-relay changes to the context onto the parent
	};


	/**
	* Message handler from child worker to parent
	* @param object msg The message object to process
	* @access private
	*/
	this._clusterWorkerMessage = function(msg) {
		if (msg.cmd && msg.cmd == 'acc.setContext')
			self._setRaw(msg.key, msg.value);
	};


	/**
	* User facing cluster() function which queues up functions to be executed later by the internal plugin
	* @params mixed mixed Various call styles - see the function
	* @return object This chainable object
	*/
	this.cluster = function() {
		var calledAs = self._getOverload(arguments);
		switch(calledAs) {
			case '':
				// Pass
				break;
			case 'array': // Form: cluster(Array <tasks>)
				this._struct.push({
					type: 'cluster',
					payload: arguments[0],
				});
				break;
			case 'object': // Form: cluster(Object <tasks>)
				var payload = [];
				var taskObj = arguments[0];
				Object.keys(taskObj).forEach(function(key) {
					var task = taskObj[key];
					payload.push(function(next) {
						self._context._key = key;
						task.call(self._context, function(err, value) {
							self._set(key, value);
							next(err);
						});
					});
				});

				self._struct.push({
					type: 'cluster',
					payload: payload,
				});
				break;
			default:
				throw new Error('Unsupported call type for async-chainable-cluster: ' + calledAs);
		}

		return this;
	};
	// }}}
	// .clusterLimit {{{
	this._plugins['clusterLimit'] = function(params) {
		if (params.payload > 0) {
			this._clusterLimit = params.payload;
		} else { // Default to number of CPU cores
			this._clusterLimit = os.cpus().length;
		}
		this._execute(); // Move onto next chain item
	};

	this.clusterLimit = function() {
		this._struct.push({
			type: 'clusterLimit',
			payload:  arguments[0],
		});

		return this;
	};
	// }}}

	// Core module overrides {{{
	/**
	* Override the core setter so that worker sets get transmitted to the master
	* @param string key The key to set
	* @param mixed value The value of the context[key] to set to
	* @access private
	*/
	this._setRaw = function(key, value) {
		this._context[key] = value; // Set local copy anyway
		if (cluster.isWorker) // If a worker - transmit change to parent
			process.send({
				cmd: 'acc.setContext',
				key: key,
				value: value,
			});
	}
	// }}}

	this._clusterLimit = os.cpus().length;
	this._clusterTasks = null;
	this._clusterHasErr = false;
};
