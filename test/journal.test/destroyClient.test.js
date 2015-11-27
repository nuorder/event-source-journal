"use strict";

var appRoot = process.cwd();

var assert = require('assert');
var sinon = require('sinon');
var Promise = require('bluebird');

var Journal = require(`${appRoot}/journal.js`);

module.exports = function() {
    describe('successful operations', Promise.coroutine(function *() {
        beforeEach(createJournal);
        
        it("should delete the instantiated adapter'", Promise.coroutine(function *() {
            try {
                yield this.journal.destroyClient();
                assert.ok(this.journal.adapter === undefined);
            }
            catch(err) {
                console.log(err)
                assert.fail(err, undefined, "should not have thrown an error");
            }
        }));
    }));
}

var createJournal = Promise.coroutine(function *() {
    this.journal = new Journal();
    yield this.journal.createClient();
});
