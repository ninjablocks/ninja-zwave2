'use strict';

var util = require('util');
var stream = require('stream');
var OZW = require('openzwave');

util.inherits(Driver,stream);

var commands = {
  COMMAND_CLASS_SWITCH_BINARY: 0x25,
  COMMAND_CLASS_SWITCH_MULTILEVEL: 0x26,
  COMMAND_CLASS_SENSOR_BINARY: 0x30
};

function Driver(opts,app) {
  this.app = app;
  this.opts = opts;

  app.once('client::up', this.init.bind(this));

  this.devices = {};
}

Driver.prototype.init = function() {
  var log = this.app.log;

  if (this.zwave) {
    this.wave.disconnect();
  }

  this.zwave = new OZW('/dev/cu.SLAB_USBtoUART', {
    logging: false,           // enable logging to OZW_Log.txt
    consoleoutput: true,     // copy logging to the console
    saveconfig: true,        // write an XML network layout
    driverattempts: 3,        // try this many times before giving up
    pollinterval: 500,        // interval between polls in milliseconds
    suppressrefresh: true,    // do not send updates if nothing changed
  });

  this.zwave.on('connected', function(){
    log.info('Connected');
  });

  this.zwave.on('driver ready', function(homeId) {
    log.info('Scanning on home id', homeId);
  });

  this.zwave.on('node added', function(nodeId) {
    log.info('Found new node', nodeId);
  });

  this.zwave.on('value added', this.onValueAdded.bind(this));

  this.zwave.connect();
  
};

Driver.prototype.onValueChanged = function(nodeId, commandClass, value) {
  var log = this.app.log;
  log.debug('Value changed nodeId:', nodeId, 'commandClass:', commandClass, 'value:', value);
};

Driver.prototype.onValueAdded = function(nodeId, commandClass, value) {
  var log = this.app.log;
  //log.debug('Found nodeId:', nodeId, 'commandClass:', commandClass, 'value:', value);

  var id = nodeId

  if (commandClass === commands.COMMAND_CLASS_SWITCH_BINARY || commands.COMMAND_CLASS_SWITCH_MULTILEVEL) {
    this.zwave.enablePoll(nodeId, commandClass);
  }

  if (commandClass === commands.COMMAND_CLASS_SENSOR_BINARY) {
    log.debug('Found a sensor');
    log.debug('Found nodeId:', nodeId, 'commandClass:', commandClass, 'value:', value);
  }

};

// Export it
module.exports = Driver;
