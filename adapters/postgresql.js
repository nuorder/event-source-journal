"use strict";
const Promise = require('bluebird');
const pg = require('pg').native;
Promise.promisifyAll(pg, { multiArgs: true });

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
 * An adapter for the Journal class to use PostgreSQL as a datastore.
 *
 * @class PostgresSQLAdapter
 *
 */
class PostgresSQLAdapter {
    constructor() {
        this.initializePublicMethods();
    }

    get name() {
        return "postgresql";
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

        return this;
    }

    /*
     * Connect to the PostgreSQL database.
     *
     * @method createDatabaseConnection
     *
     * @optional {Object}  An object of connection properties. See the pg
     *  documentation for valid options.
     *
     * @return {Promise}
     *
     */
    *createDatabaseConnection(dbConnectionOptions) {
        const defaults = {
            host: 'localhost',
            port: '5432',
            database: 'event_source',
            tableName: 'events',

            user: '',
            password: null,

            poolSize: 10
        };

        if(!this.config) {
            this.config = _.merge({}, defaults, dbConnectionOptions);
            this.tableName = this.config.tableName;
        }

        const connectionResults = yield pg.connectAsync(this.config);
        const connection = connectionResults[0];
        const done = connectionResults[1];

        const createTableQuery = `CREATE TABLE IF NOT EXISTS ${this.tableName} (
                _id             BIGSERIAL,
                version         INTEGER NOT NULL DEFAULT 1,
                ref             CHAR(24) NOT NULL,
                event           VARCHAR(75) NOT NULL,
                initiated_by    CHAR(24),
                created_on      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                payload         JSON,
                PRIMARY KEY(_id),
                UNIQUE (version, ref)
            );
        `;

        Promise.promisify(connection.query, {context: pg});

        yield connection.queryAsync(createTableQuery);
        done();

        return this;
    }

    /*
     * Disconnect from PostgreSQL.
     *
     * @method closeDatabaseConnection
     *
     * @return {this}
     *
     */
    closeDatabaseConnection() {
        pg.end();

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
    *createEventForRef(eventName, refId, eventData, userId, currentVersion, connection) {
        let done;
        let results;

        if(!connection) {
            const connectionResults = yield pg.connectAsync(this.config);
            connection = connectionResults[0];
            done = connectionResults[1];

            Promise.promisifyAll(connection, {context: pg});
        }

        if(!currentVersion) {
            currentVersion = yield this.getLatestVersionForRef(refId, connection);
        }

        try {
            const query = `INSERT INTO ${this.tableName} 
                (version, ref, event, initiated_by, payload) 
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;

            const queryArgs = [
                currentVersion + 1,
                refId,
                eventName,
                userId || null,
                eventData || null
            ];

            const queryResults = yield connection.queryAsync(query, queryArgs);
            if(done) {
                done();
            }

            results = queryResults.rows[0];
        }
        catch(error) {
            if(done) {
                done();
            }

            if(error.sqlState && error.sqlState === '23505') {
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

        return results;
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
        const fromQuery = fromVersion ? `AND version >= ${fromVersion}` : '';
        const toQuery = toVersion ? `AND version <= ${toVersion}` : '';

        const query = `SELECT * FROM ${this.tableName} 
            WHERE ref=$1 ${fromQuery} ${toQuery}
            ORDER BY version ASC
        `;

        const connectionResults = yield pg.connectAsync(this.config);
        const connection = connectionResults[0];
        const done = connectionResults[1];

        Promise.promisifyAll(connection, { context: pg });

        const result = yield connection.queryAsync(query, refId);
        done();

        return result.rows;
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
    *getLatestVersionForRef(refId, connection) {
        const query = `SELECT MAX(version) AS version FROM ${this.tableName} WHERE ref=$1`;
        let done;

        if(!connection) {
            const connectionResults = yield pg.connectAsync(this.config);
            connection = connectionResults[0];
            done = connectionResults[1];

            Promise.promisifyAll(connection, { context: pg });
        }

        const result = yield connection.queryAsync(query, [refId]);
        const version = result.rows[0].version;

        if(done) {
            done();
        }

        return version || 0;
    }
}

exports = module.exports = PostgresSQLAdapter;
