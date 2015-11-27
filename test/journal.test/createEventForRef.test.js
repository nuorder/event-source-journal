"use strict";

var appRoot = process.cwd();

var assert = require('assert');
var sinon = require('sinon');
var Promise = require('bluebird');

var Journal = require(`${appRoot}/journal.js`);

module.exports = function() {
    beforeEach(setupIds);
    beforeEach(createJournal);
    beforeEach(createStub);

/*
eventName, refId, eventData, userId, currentVersion
else if(!eventName) {
    throw new JournalError(400, "Missing eventName", {eventName: eventName});
}
else if(typeof eventName !== 'string') {
    throw new JournalError(400, "Invalid eventName", {eventName: eventName});
}
else if(currentVersion !== undefined && typeof currentVersion !== 'number') {
    throw new JournalError(400, "currentVersion must be a number", {currentVersion: currentVersion});
}
else if(currentVersion !== undefined && currentVersion < 0) {
    throw new JournalError(400, "currentVersion must be a positive number", {currentVersion: currentVersion});
}
else if(currentVersion !== undefined && parseInt(currentVersion) !== currentVersion) {
    throw new JournalError(400, "currentVersion must be an integer", {currentVersion: currentVersion});
}        
else if(eventData === 'function') {
    throw new JournalError(400, "eventData cannot be a function", {eventData: eventData});
}
else if(!Array.isArray(eventData) && typeof eventData === 'object' && !_.isPlainObject(eventData)) {
    throw new JournalError(400, "eventData cannot be a custom object", {eventData: eventData});
}

*/
    
    describe('error handling', function() {
        it('should throw an error when missing eventName', Promise.coroutine(function *() {
            try {
                yield this.journal.createEventForRef();
                assert.fail('succeeded', 'failed', "succeeded with invalid parameters");
            }
            catch(err) {
                assert.ok(err instanceof Error, "did not throw an error");
                assert.equal(400, err.code);
                assert.equal("missing eventname", err.message.toLowerCase());
            }
        }));

        it('should throw an error when given an invalid missing eventName', Promise.coroutine(function *() {
            try {
                yield this.journal.createEventForRef({});
                assert.fail('succeeded', 'failed', "succeeded with invalid parameters");
            }
            catch(err) {
                assert.ok(err instanceof Error, "did not throw an error");
                assert.equal(400, err.code);
                assert.equal("invalid eventname", err.message.toLowerCase());
            }
        }));
        
        it('should throw an error when given an invalid currentVersion', Promise.coroutine(function *() {
            try {
                yield this.journal.createEventForRef("test", this.ids.valid, {}, "user", "version");
                assert.fail('succeeded', 'failed', "succeeded with invalid parameters");
            }
            catch(err) {
                assert.ok(err instanceof Error, "did not throw an error");
                assert.equal(400, err.code);
                assert.equal("currentversion must be a number", err.message.toLowerCase());
            }
        }));
    });
    
    describe('successful operations', Promise.coroutine(function *() {
 
    }));
}

var setupIds = function setupIds() {
    this.ids = {
        success: "valid_id",
        error: "invalid_id"
    };
};

var createJournal = Promise.coroutine(function *() {
    this.journal = new Journal();
    yield this.journal.createClient();
});

var createStub = Promise.coroutine(function *() {
    var method = Promise.method((eventName, refId, eventData, userId, currentVersion) => {
        var entry;
        
        if(refId === this.ids.error) {
            throw new Error("version conflict");
        }
        else {
            entry = {
                event: eventName,
                ref: refId,
                payload: eventData,
                initiated_by: userId,
                version: currentVersion + 1
            }            
        }
        
        return entry;
    });
});
