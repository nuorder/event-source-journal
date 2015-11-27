"use strict";
var Promise = require('bluebird');

var _ = require('lodash');

function AdapterError(code, message, args) {
  this.name = 'AdapterError';
  this.arguments = args;
  this.message = message || 'An error occurred';
  this.stack = (new Error()).stack;
}

AdapterError.prototype = Object.create(Error.prototype);
AdapterError.prototype.constructor = AdapterError;

/*
 * This is currently just a stub so that tests can be written against the main class
 * without needing to use one of the primary adapters
 *
 * @class PostgresSQLAdapter
 *
 */
 
class MemoryAdapter {
    constructor(options) {
        this.db = [];
        this.initializePublicMethods();
    }
    
    get name() {
        return "memory";
    }
    
    /*
     * Wrap class methods in Bluebird couroutines as we cannot define dynamic methods when
     * creating a class.
     *
     * @method initializePublicMethods
     *
     * @return {this};
     *
     */

    initializePublicMethods() {
        this.createEventForRef = Promise.coroutine(this.createEventForRef);
        this.getLatestVersionForRef = Promise.coroutine(this.getLatestVersionForRef);
        this.createDatabaseConnection = Promise.coroutine(this.createDatabaseConnection);
        this.closeDatabaseConnection = Promise.method(this.closeDatabaseConnection);
        
        return this;
    }
    
    /*
     * Initialize the in memory db.
     *
     * @method createDatabaseConnection
     *
     * @return {Promise}
     *
     */

    *createDatabaseConnection() {
        this.db = [];
        
        return this;
    }

    /*
     * Disconnect from the in memory db.
     *
     * @method closeDatabaseConnection
     *
     * @return {this}
     *
     */
    
    closeDatabaseConnection() {
        delete this.db;
        
        return this;
    }
    
    /*
     * Create a new event and store it in the database.
     *
     * @method createEventForRef
     *
     * @required {String}  eventName
     * @required {String}  refId
     * @optional {Object}  eventData
     * @optional {String}  userId
     * @optional {Number}  currentVersion
     *
     * @return {Event}
     *
     */
    
    *createEventForRef(eventName, refId, eventData, userId, currentVersion) {
        if(!currentVersion) {
            currentVersion = yield this.getLatestVersionForRef(refId, connection);
        }

        let entry = {
            event: eventName,
            ref: refId,
            payload: eventData,
            initiated_by: userId,
            version: currentVersion + 1
        };
        
        var versionCheckFail = this.db.some(function(storedEntry) {
            return storedEntry.ref === entry.ref && storedEntry.version >= entry.version;
        });
        
        if(!versionCheckFail) {
            this.db.push(entry);
        }
        else {
            let latestVersion = yield this.getLatestVersionForRef(refId);
            throw new AdapterError(409, "version conflict", {
                currentVersion: currentVersion,
                latestVersion: latestVersion
            });                
        }
        
        return entry;
    }
    
    /*
     * Get events for a given ref (optionally) between two versions.
     *
     * @method getEventsForRef
     *
     * @required {String}  refId
     * @optional {Number}  fromVersion
     * @optional {Number}  toVersion     
     *
     * @return {[Row]}
     *
     */
         
    *getEventsForRef(refId, fromVersion, toVersion) {
        let results = this.db.filter(function(storedEntry) {
            return storedEntry.ref === refId && storedEntry.version >= fromVersion && storedEntry.version <= toVersion;
        });

        return results;
    }
        
    /*
     * Get the highest version number for a given ref. If no events exists for a ref, will return 0.
     *
     * @method getLatestVersionForRef
     *
     * @required {String}  refId
     *
     * @return {Number}
     *
     */
         
    *getLatestVersionForRef(refId) {
        let results = this.db.filter(function(storedEntry) {
            return storedEntry.ref === refId && storedEntry.version >= fromVersion && storedEntry.version <= toVersion;
        });
        
        results.sort(function(a, b) {
            return b.version - a.version;
        });

        return results[0] ? results[0].version : 0;
    }  
}

exports = module.exports = MemoryAdapter;
