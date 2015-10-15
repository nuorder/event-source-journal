"use strict";

var Promise = require('bluebird');
var _ = require('lodash');

const privateData = new WeakMap();
const validAdapters = ['mongodb', 'sql', 'memory'];

function JournalError(code, message, args) {
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
        var defaults = {
            adapterName: 'mongodb',
            dbConnectionOptions: null
        };

        var config = _.merge({}, defaults, options);

        const self = {
            config: config
        };

        privateData.set(this, self);
        
        this.initializePublicMethods();
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
        if(!this.initialized) {
            this.createClient = Promise.coroutine(this.createClient);
            this.destroyClient = Promise.coroutine(this.destroyClient);
            this.createEventForRef = Promise.coroutine(this.createEventForRef);
            this.getEventsForRef = Promise.coroutine(this.getEventsForRef);
        }
        
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
        adapter = (adapter || privateData.get(this).config.adapterName).toLowerCase();
        dbConnectionOptions = dbConnectionOptions || privateData.get(this).config.dbConnectionOptions;
        
        if (validAdapters.indexOf(adapter) === -1) {
            let adapters = validAdapters.join(', ');
            let errorMessage = `"${adapter}" is an invalid adapter. Please use one of "${adapters}"`;
            
            throw new TypeError(errorMessage);
        }
        else if(privateData.get(this).adapter) {
            let errorMessage = `"${privateData.get(this).config.adapterName}" has already been initialized"`;
            
            throw new TypeError(errorMessage);
        }
        else {
            let Adapter = require(`./adapters/${adapter}.js`);
            try {
                let connectedAdapter = yield new Adapter().createDatabaseConnection(dbConnectionOptions);
                
                this.initialized = true;
                this.adapterName = privateData.get(this).config.adapterName;
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
            yield privateData.get(this).adapter.closeDatabaseConnection();
            
            delete this.adapterName;
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
            throw new JournalError(400, "fromVersion must be a number", {fromVersion: fromVersion});
        }
        else if(toVersion !== undefined && typeof toVersion !== 'number') {
            throw new JournalError(400, "toVersion must be a number", {toVersion: toVersion});
        }
        else if(toVersion !== undefined && fromVersion !== undefined && fromVersion > toVersion) {
            throw new JournalError(400, "toVersion is less than fromVersion", {toVersion: toVersion, fromVersion: fromVersion});
        }

        return yield privateData.get(this).adapter.getEventsForRef(refId, fromVersion, toVersion);
    }      
}

exports = module.exports = Journal;
