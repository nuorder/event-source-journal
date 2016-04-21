"use strict";

const Promise = require('bluebird');
const _ = require('lodash');

const privateData = new WeakMap();
const validAdapters = ['mongodb', 'postgresql', 'memory'];

/**
 * An error.
 *
 * @constructor JournalError
 * @param {number} code - The http status code meant associated with the error
 * @param {string} message - The message describing the error
 * @param {object} args - Any relevant arguments to be returned to the user/developer
 *
 */
function JournalError(code, message, args) {
    this.code = code || 500;
    this.name = 'JournalError';
    this.arguments = args;
    this.message = message || 'An error occurred';
    this.stack = (new Error()).stack;
}

JournalError.prototype = Object.create(Error.prototype);
JournalError.prototype.constructor = JournalError;

/*
 * A Journal is an object meant to act as a manager for Event Sourcing. It can
 * be used with multiple datastores, including MongoDB, MySQL, Amazon Aurora, or
 * an in memory adapter.
 *
 * @class Journal
 *
 */
class Journal {
    constructor(options) {
        const defaults = {
            adapterName: 'memory',
            dbConnectionOptions: null
        };

        const config = _.merge({}, defaults, options);
        const self = {
            config: config
        };

        privateData.set(this, self);

        this.initializePublicMethods();
    }

    get adapter() {
        return privateData.get(this).adapter;
    }

    get adapterName() {
        return privateData.get(this).config.adapterName;
    }

    get dbConnectionOptions() {
        return privateData.get(this).config.dbConnectionOptions;
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
        this.createClient = Promise.coroutine(this.createClient);
        this.destroyClient = Promise.coroutine(this.destroyClient);
        this.createEventForRef = Promise.coroutine(this.createEventForRef);
        this.getEventsForRef = Promise.coroutine(this.getEventsForRef);

        return this;
    }

    /*
     * Instantiate an instance of the specified adapater, and create a connection to it's
     * underlying datastore.
     *
     * @method createClient
     *
     * @optional {String}  The name of the adapter you wish to use.
     * @optional {Object}  An object of connection properties, specific to the adapter you are using.
     *
     * @return {this}
     *
     */

    *createClient(adapter, dbConnectionOptions) {
        let errorMessage;

        adapter = (adapter || privateData.get(this).config.adapterName).toLowerCase();
        dbConnectionOptions = dbConnectionOptions || privateData.get(this).config.dbConnectionOptions;

        if (validAdapters.indexOf(adapter) === -1) {
            const adapters = validAdapters.join(', ');
            errorMessage = `"${adapter}" is an invalid adapter. Please use one of "${adapters}"`;

            throw new TypeError(errorMessage);
        }
        else if(privateData.get(this).adapter) {
            errorMessage = `"${privateData.get(this).config.adapterName}" has already been initialized"`;

            throw new TypeError(errorMessage);
        }
        else {
            const Adapter = require(`./adapters/${adapter}.js`);

            try {
                const connectedAdapter = yield new Adapter().createDatabaseConnection(dbConnectionOptions);

                this.initialized = true;
                privateData.get(this).adapter = connectedAdapter;
            }
            catch(err) {
                throw new Error(err.message);
            }
        }

        return this;
    }

    /*
     * Close the underlying connection to the adapter's datastore and reset the Journal to
     * it's initial state.
     *
     * @method destroyClient
     *
     * @return {this}
     *
     */

    *destroyClient() {
        if(this.initialized) {
            this.initialized = false;
            yield privateData.get(this).adapter.closeDatabaseConnection();
            delete privateData.get(this).adapter;
        }

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
        if(!this.initialized) {
            throw new JournalError(500, "Journal has not been initialized");
        }
        else if(!eventName) {
            throw new JournalError(400, "Missing eventName", { eventName: eventName });
        }
        else if(typeof eventName !== 'string') {
            throw new JournalError(400, "Invalid eventName", { eventName: eventName });
        }
        else if(currentVersion !== undefined && typeof currentVersion !== 'number') {
            throw new JournalError(400, "currentVersion must be a number", { currentVersion: currentVersion });
        }
        else if(currentVersion !== undefined && currentVersion < 0) {
            throw new JournalError(400, "currentVersion must be a positive number", { currentVersion: currentVersion });
        }
        else if(currentVersion !== undefined && parseInt(currentVersion) !== currentVersion) {
            throw new JournalError(400, "currentVersion must be an integer", { currentVersion: currentVersion });
        }
        else if(typeof eventData === 'function') {
            throw new JournalError(400, "eventData cannot be a function", { eventData: eventData });
        }
        else if(!Array.isArray(eventData) && typeof eventData === 'object' && !_.isPlainObject(eventData)) {
            throw new JournalError(400, "eventData cannot be a custom object", { eventData: eventData });
        }

        return yield privateData.get(this).adapter.createEventForRef(eventName, refId, eventData, userId, currentVersion);
    }

    /*
     * Get events for a given refId. May optionally specify a fromVersion and a toVersion (inclusive).
     *
     * @method getEventsForRef
     *
     * @required {String}  refId
     * @optional {Number}  fromVersion
     * @optional {Number}  toVersion
     *
     * @return [{Events}]
     *
     */
    *getEventsForRef(refId, fromVersion, toVersion) {
        if(!this.initialized) {
            throw new JournalError(500, "Journal has not been initialized");
        }
        else if(fromVersion !== undefined && typeof fromVersion !== 'number') {
            throw new JournalError(400, "fromVersion must be a number", { fromVersion: fromVersion });
        }
        else if(toVersion !== undefined && typeof toVersion !== 'number') {
            throw new JournalError(400, "toVersion must be a number", { toVersion: toVersion });
        }
        else if(toVersion !== undefined && fromVersion !== undefined && fromVersion > toVersion) {
            throw new JournalError(400, "toVersion is less than fromVersion", { toVersion: toVersion, fromVersion: fromVersion });
        }

        return yield privateData.get(this).adapter.getEventsForRef(refId, fromVersion, toVersion);
    }
}

exports = module.exports = Journal;
