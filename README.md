async-chainable-cluster
=======================
Plugin for [async-chainable](https://github.com/hash-bang/async-chainable) that adds clustering for tasks.

A clustered task is the same as the regular `parallel()` call but run across multiple cores.

	var asyncChainable = require('async-chainable');
	var asyncChainableCluster = require('async-chainable-cluster');

	asyncChainable()
		.use(asyncChainableCluster)
		.cluster([
			function(next) {
				console.log('Task 1 running');
				setTimeout(next, Math.random() * 3000);
			},
			function(next) {
				console.log('Task 2 running');
				setTimeout(next, Math.random() * 3000);
			},
			function(next) {
				console.log('Task 3 running');
				setTimeout(next, Math.random() * 3000);
			},
		])
		.end();

API
===
async-chainable-cluster provides a single function, `cluster()` which can be called a number of ways:

	cluster(Array <tasks>) // Execute all tasks spread across multiple cores


How it works
============
This clustering component operates in the following way:

1. When it is time to execute the clustering component (assuming all preceding async-chainable tasks have been completed up to this point without errors) begin the main thread
2. From the master (outer) process spawn a number of workers. This is determined either from the number of CPU cores OR from `clusterLimit()` being called first
3. Wait for each worker to settle - the workers then ask the master for a task
4. Delegate a task to each worker from the master from the stack of tasks
5. Let the workers complete their processing
6. On completion a worker communicates back to the master that processing has completed and optionally sends back a final value
7. The master accepts the closing state, sets the internal value (if any) and begins another worker until all tasks are exhausted


Caveats
-------
The workers can send back values to the parent via IPC, this means that only values under the control of async-chainable will be transmitted.

For example:

	var foo = 0, bar = 0;
	asyncChainable()
		.use(asyncChainableCluster)
		.cluster([
			function(next) {
				foo = 1;
				next();
			},
			function(next) {
				bar = 1;
				next();
			},
		])
		.end();

This will **not** work as `foo` and `bar` are outside the control of async-chainable and therefore, while their values will be set in the individual workers, the outer parent will not recieve the variables new value.

To work around this use async-chainable's set functionality like so:

	asyncChainable()
		.use(asyncChainableCluster)
		.set({
			foo: 0,
			bar: 0,
		})
		.cluster({
			foo: function(next) {
				next(1);
			},
			bar: function(next) {
				next(1);
			},
		})
		.end();

Note that now each function is named and that the return of each function sets the (internally controlled) values specified by set.


TODO
====
* Ability to bind external variables into worker scope
* `Object.observe` on object context and auto-relay changes to master cluster agent - see `_clusterWorkerAlloc()`
