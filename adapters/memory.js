"use strict";
const Promise = require('bluebird');

/**
 * An error.
 *
 * @constructor AdapterError
 * @param {number} code - The http status code meant associated with the error
 * @param {string} message - The message describing the error
 * @param {object} args - Any relevant arguments to be returned to the user/developer
 *
 */
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
    constructor() {
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
            currentVersion = yield this.getLatestVersionForRef(refId);
        }

        const entry = {
            event: eventName,
            ref: refId,
            payload: eventData,
            initiated_by: userId,
            version: currentVersion + 1
        };

        const versionCheckOk = !this.db.some(function(storedEntry) {
            return storedEntry.ref === entry.ref && storedEntry.version >= entry.version;
        });

        if(versionCheckOk) {
            this.db.push(entry);
        }
        else {
            const latestVersion = yield this.getLatestVersionForRef(refId);
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
        const results = this.db.filter(function(storedEntry) {
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
        const results = this.db.filter(function(storedEntry) {
            return storedEntry.ref === refId;
        });

        results.sort(function(a, b) {
            return b.version - a.version;
        });

        return results[0] ? results[0].version : 0;
    }
}

exports = module.exports = MemoryAdapter;
