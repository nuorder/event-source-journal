"use strict";
const Promise = require('bluebird');
const mongoose = require('mongoose');
const setupDataModel = require('./mongodb-lib/model.js');

const _ = require('lodash');

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
 * An adapter for the Journal class to use MongoDB as a datastore.
 * Note that this requires MongoDB version 2.6.x or greater.
 *
 * @class MongoDBAdapter
 *
 */

class MongoDBAdapter {
    constructor() {
        this.initializePublicMethods();
    }

    get name() {
        return "mongodb";
    }

    static _isValidObjectId(value) {
        const regex = /^[a-f0-9]{24}$/i;
        let valid = false;

        value = value && typeof value.toString === 'function' ? value.toString() : value;

        if (value) {
            valid = regex.test(value);
        }

        return valid;
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

        return this;
    }

    /*
     * Connect to the MongoDB database.
     *
     * @method createDatabaseConnection
     *
     * @optional {Object}  An object of connection properties. See the Mongoose
     *  documentation for valid options.
     *
     * @return {Promise}
     *
     */
    createDatabaseConnection(dbConnectionOptions) {
        const defaults = {
            hosts: 'localhost:27018',
            dbName: 'event_source',
            collectionName: 'events',

            server: {
                socketOptions: {
                    keepAlive: 1
                }
            },

            replset: {
                socketOptions: {
                    keepAlive: 1
                }
            }
        };

        const config = _.merge({}, defaults, dbConnectionOptions);
        const connectionString = `mongodb://${config.hosts}/${config.dbName}`;

        this.connection = mongoose.createConnection(connectionString, config);
        this.Event = setupDataModel(this.connection, config.collectionName);

        return new Promise((resolve, reject) => {
            this.connection.on('open', () => {
                resolve(this);
            });

            this.connection.on('error', (error) => {
                reject({
                    code: 502,
                    message: error.message,
                    originalError: error
                });
            });
        });
    }

    /*
     * Disconnect from MongoDB.
     *
     * @method closeDatabaseConnection
     *
     * @return {this}
     *
     */
    closeDatabaseConnection() {
        mongoose.disconnect();

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
        if(!this.constructor._isValidObjectId(refId)) {
            throw new AdapterError(400, "Invalid refId", { refId: refId });
        }

        if(!currentVersion) {
            currentVersion = yield this.getLatestVersionForRef(refId);
        }

        const newEvent = new this.Event({
            _id: new mongoose.Types.ObjectId(),
            version: currentVersion + 1,
            ref: refId,
            event: eventName,
            created_on: new Date()
        });

        if(eventData) {
            newEvent.payload = eventData;
        }

        if(userId) {
            newEvent.initiated_by = userId;
        }

        try {
            yield newEvent.save();
        }
        catch(error) {
            if(error.message && error.message.match(/E11000/i)) {
                const latestVersion = yield this.getLatestVersionForRef(refId);

                throw new AdapterError(409, "version conflict", {
                    currentVersion: currentVersion,
                    latestVersion: latestVersion
                });
            }
            else {
                throw new AdapterError(400, "adapter error", {
                    originalError: error
                });
            }
        }
        return newEvent.toObject();
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
     * @return {[Event]}
     *
     */

    getEventsForRef(refId, fromVersion, toVersion) {
        const query = this.Event.find({ ref: refId });
        const querySortOrder = {
            version: 1
        };

        if(fromVersion) {
            query.gte('version', fromVersion);
        }

        if(toVersion) {
            query.lte('version', toVersion);
        }

        return query.sort(querySortOrder).exec();
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
        const events = yield this.Event.find({ ref: refId }, { version: 1 }).sort({ version: -1 }).limit(1).lean().exec();
        return events[0] ? events[0].version : 0;
    }
}

exports = module.exports = MongoDBAdapter;
