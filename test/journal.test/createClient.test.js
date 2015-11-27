"use strict";

var appRoot = process.cwd();

var assert = require('assert');
var sinon = require('sinon');
var Promise = require('bluebird');

var Journal = require(`${appRoot}/journal.js`);

module.exports = function() {
    describe('error handling', function() {
        it('should throw an error when given an invalid adapter', Promise.coroutine(function *() {
            var journal = new Journal();

            try {
                yield journal.createClient('badadapter');
                assert.fail('succeeded', 'failed', "connected to an invalid adapter");
            }
            catch(err) {
                assert.ok(err instanceof TypeError, "did not throw a TypeError");
                assert.ok(err.toString().indexOf('"badadapter" is an invalid adapter') !== -1);
            }
        }));

        it('should throw an error when called multiple times', Promise.coroutine(function *() {
            var journal = new Journal();
            
            try {
                yield journal.createClient('memory');
                yield journal.createClient('memory');
            }
            catch(err) {
                assert.ok(err instanceof TypeError, "did not throw a TypeError");
                assert.ok(err.toString().indexOf('has already been initialized') !== -1);
            }
        }));
    });
    
    describe('successful operations', Promise.coroutine(function *() {
        it('should successfully load the adapter when passed into the constructor', Promise.coroutine(function *() {
            var journal = new Journal({adapter: 'memory'});

            try {
                yield journal.createClient();
                assert.equal(journal.adapter.name, 'memory');
            }
            catch(err) {
                console.log(err)
                assert.fail(err, undefined, "should not have thrown an error");
            }
        }));
        
        it('should successfully load the adapter when passed into createClient', Promise.coroutine(function *() {
            var journal = new Journal({adapter: 'mongodb'});

            try {
                yield journal.createClient();
                assert.equal(journal.adapter.name, 'memory');
            }
            catch(err) {
                console.log(err)
                assert.fail(err, undefined, "should not have thrown an error");
            }
        }));        
    }));
}
