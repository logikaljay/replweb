// express & socket.io
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var Stream = require('stream');
http.listen(3000);
app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

// repl & decycle
var repl = require('repl');
var util = require('util');
var debug = util.debuglog('repl');
var vm = require('vm');
var decycle = require('./cycle.js');
var r;

// setup repl & socket.io
var self = this;
io.on('connection', function(socket) {
	
	console.log('a user has connected');
	
	var stream = createStream(socket);
	r = repl.start({
		prompt: '',
		input: stream,
		output: stream,
		ignoreUndefined: true,
		eval: _eval
	});
	
	r.context.inspect = function(value) {
		r.outputStream.write(r.writer(value));	
	};
	
	// remove the repl on disconnect
	socket.on('disconnected', function() {
		r = null;
	});
	
	// add some test fields into the context
	r.context.r = r;
	r.context.foo = { foo: 'bar' };
	r.context.bar = { bar: 'foo', foo: function() { console.log('bar'); } };
});

var createStream = function(socket) {
  var stream = new Stream();
  stream.readable = true;
  stream.resume = function() {};

  stream.write = function(data) {
	console.log(data);
    socket.emit('stdout', data);
  };

  socket.on('stdin', function(data) {
	console.log(data);
    // emit data to repl stream - DOES NOT WORK
    stream.emit('data', data + "\n");
  });

  return stream;
};

var _eval = function(cmd, context, filename, callback) {
	var err, result, script;
	context.decycle = JSON.decycle;
	// first, create the Script object to check the syntax
	try {
		var _cmd;
		if (cmd.toString().match(/inspect((.*))/) !== null) {
			_cmd = "JSON.stringify(decycle("+_cmd+"))";
		} else {
			_cmd = cmd;
		}
		
		script = vm.createScript(_cmd, {
			filename: filename,
			displayErrors: false
		});
	} catch (e) {
		err = e;
		debug('parse error %j', cmd, e);
	}

	if (!err) {
		try {
			if (self.useGlobal) {
				result = script.runInThisContext({ displayErrors: false });
			} else {
				result = script.runInContext(context, { displayErrors: false });
			}
		} catch (e) {
			err = e;
			if (err && process.domain) {
				debug('not recoverable, send to domain');
				process.domain.emit('error', err);
				process.domain.exit();
				return;
			}
		}
	}

	callback(err, result);
};