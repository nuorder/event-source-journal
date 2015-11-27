"use strict";

var appRoot = process.cwd();

var assert = require('assert');
var sinon = require('sinon');
var Journal = require(`${appRoot}/journal.js`);

module.exports = function() {
    it('should default to the memory adapter', function() {
        var journal = new Journal();
        assert.equal('memory', journal.adapterName);
    });

    it('should not have preconfigured dbConnectionOptions', function() {
        var journal = new Journal();
        assert.strictEqual(null, journal.dbConnectionOptions);
    });
    
    it('should allow the adapter to be specified', function() {
        var journal = new Journal({adapterName: 'mongodb'});
        assert.equal('mongodb', journal.adapterName);
    });

    it('should allow for dbConnectionOptions to be specified', function() {
        var journal = new Journal({dbConnectionOptions: {host: 'localhost'}});
        assert.equal('object', typeof journal.dbConnectionOptions);
        assert.equal('localhost', journal.dbConnectionOptions.host);
    });
    
    it('should expose methods wrapped by Promise.coroutine', function() {
        let methods = {
            'createClient': false,
            'destroyClient': false,
            'createEventForRef': false,
            'getEventsForRef': false
        };
        
        let journal = new Journal();
        
        for(let method in journal) {
            if(method in methods) {
                methods[method] = true;
            }
        }
        
        for(let methodName in methods) {
            assert.ok(methods[methodName]);
        }
    });
}
