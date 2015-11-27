"use strict";

var appRoot = process.cwd();

var assert = require('assert');
var sinon = require('sinon');
var Journal = require(`${appRoot}/journal.js`);

describe('journal class', function() {
    beforeEach(function() {
        this.sandbox = sinon.sandbox.create();
    });
    
    afterEach(function() {
        this.sandbox.restore();
    });
    
    describe('constructor', require('./constructor.test.js'));
    describe('createClient', require('./createClient.test.js'));
    describe('destroyClient', require('./destroyClient.test.js'));
    describe('createEventForRef', require('./createEventForRef.test.js'));
    
    describe('exports', function() {
        it('should export a class', function(done) {
            var journal = new Journal();
            assert.equal('function', typeof Journal, "");
            assert.strictEqual(true, journal instanceof Journal);
            
            done();
        });
    });
});
