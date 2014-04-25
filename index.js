'use strict';

var util = require('util');
var stream = require('stream');
var OZW = require('openzwave');
var _ = require('underscore');

util.inherits(Driver,stream);

var Commands = require('./lib/CommandClasses.js')

function Driver(opts,app) {
  this.app = app;
  this.opts = opts;

  app.once('client::up', this.init.bind(this));

  this.nodes = {};
}

Driver.prototype.init = function() {
  var log = this.app.log;

  if (this.zwave) {
    this.wave.disconnect();
  }

  this.zwave = new OZW('/dev/cu.SLAB_USBtoUART', {
    logging: false,           // enable logging to OZW_Log.txt
    consoleoutput: false,     // copy logging to the console
    saveconfig: false,        // write an XML network layout
    driverattempts: 3,        // try this many times before giving up
    pollinterval: 500,        // interval between polls in milliseconds
    suppressrefresh: false,    // do not send updates if nothing changed
  });

  this.zwave.on('connected', function(){
    log.info('Connected');
  });

  this.zwave.on('driver ready', function(homeId) {
    log.info('Scanning on home id', homeId);
    this.homeId = homeId;
  }.bind(this));

  this.zwave.on('node added', function(nodeId) {
    this.nodes[nodeId] = {commands:{}};
  }.bind(this));

  this.zwave.on('value added', function(nodeId, commandClass, value) {
      var commands = this.nodes[nodeId].commands;
      if (!commands[commandClass]) {
        commands[commandClass] = [];
      }
      this.nodes[nodeId].commands[commandClass][value.index] = value;
  }.bind(this));

  this.zwave.on('value changed', function(nodeId, commandClass, v) {

    var device = this.nodes[nodeId].commands[commandClass][v.index].device;
    if (device) {
      device.onValue(v);
    } else if (v.genre == 'user' && this.nodes[nodeId].fullName) {
      log.warn('Unused value', this.nodes[nodeId].fullName, commandClass, v.label, v);
    }
    
  }.bind(this));

  this.zwave.on('node ready', function(nodeId, nodeInfo) {
    var node = this.nodes[nodeId];

    if (node.fullName) {
      return; // We've seen this one before
    }

    node.id = nodeId;
    _.extend(node, nodeInfo);

    node.fullName = (node.name? node.name + ' - ': '') + node.product + ' by ' + node.manufacturer;

    log.info('Found node -', node.fullName);
    
    this.onNodeReady(node);
  }.bind(this));

  this.zwave.connect();
  
};


Driver.prototype.onNodeReady = function(node) {

  var log = this.app.log;

 

  Object.keys(node.commands).forEach(function(commandId) {

    switch (commandId) {
      case Commands.SWITCH_BINARY:
      case Commands.SWITCH_MULTILEVEL:
      case Commands.SWITCH_MULTILEVEL_V2:
        this.zwave.enablePoll(node.id, commandId);
        break;
    }

    node.commands[commandId].forEach(function(value) {
      if (!value) return;

      var device = new Device();
      device.G = 'zwave' +  this.homeId + node.id + commandId + value.index;
      device.name = value.label + ' - ' + node.fullName;
      
      if (value.label.match(/temperature/i)) {
        device.V = 0;
        device.D = 9;
        device.onValue = function(value) {
          this.emit('data', (value.value - 32) * 5 / 9.0);
        };
      } else if (value.label.match(/humidity/i)) {
        device.V = 0;
        device.D = 8;
        device.onValue = function(value) {
          this.emit('data', value.value)
        };
      } else if (value.label.match(/battery/i) && value.type == 'byte') {
        device.V = 0;
        device.D = 8; // Use humidity for now
        device.onValue = function(value) {
          this.emit('data', value.value)
        };
      } else if (value.label.match(/luminance/i)) {
        device.V = 0;
        device.D = 2000;
        device.onValue = function(value) {
          this.emit('data', value.value)
        };
      } else if (value.label.match(/sensor/i) && value.type == 'bool') {
        device.V = 0;
        device.D = 7;
        device.onValue = function(value) {
          this.emit('data', value.value?'0':'1')
        };
      }

      if (device.D) {
        value.device = device;
        this.emit('register', device);
      }
      
    }.bind(this));
  }.bind(this));

};

function Device() {
}
util.inherits(Device, stream);

module.exports = Driver;
