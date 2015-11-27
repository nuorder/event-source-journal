"use strict";
var Promise = require('bluebird');
var pg = require('pg').native;
Promise.promisifyAll(pg, {multiArgs: true});

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
 * An adapter for the Journal class to use PostgreSQL as a datastore.
 *
 * @class PostgresSQLAdapter
 *
 */
 
class PostgresSQLAdapter {
    constructor(options) {
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
        var defaults = {
            host: 'localhost',
            port: '5432',
            database: 'event_source',
            tableName: 'events',

            user: '',
            password: null,
            
            poolSize: 10,
        };
        
        if(!this.config) {
            this.config = _.merge({}, defaults, dbConnectionOptions);
            this.tableName = this.config.tableName;
        }

        let connectionResults = yield pg.connectAsync(this.config);
        let connection = connectionResults[0];
        let done = connectionResults[1];
        
        let createTableQuery = `CREATE TABLE IF NOT EXISTS ${this.tableName} (
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
        
        let queryResults = yield connection.queryAsync(createTableQuery);
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
        var done, results;
        
        if(!connection) {
            let connectionResults = yield pg.connectAsync(this.config);
            connection = connectionResults[0];
            done = connectionResults[1];
            
            Promise.promisifyAll(connection, {context: pg});
        }

        if(!currentVersion) {
            currentVersion = yield this.getLatestVersionForRef(refId, connection);
        }

        try {
            let query = `INSERT INTO ${this.tableName} 
                (version, ref, event, initiated_by, payload) 
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;
            
            let queryArgs = [
                currentVersion + 1,
                refId,
                eventName,
                userId || null,
                eventData || null
            ];
            
            let queryResults = yield connection.queryAsync(query, queryArgs);
            if(done) {
                done();
            }
            
            results = queryResults.rows[0];
        }
        catch(error) {
            if(done) {
                done();
            }
            
            if(error.sqlState && error.sqlState == '23505') {
                let latestVersion = yield this.getLatestVersionForRef(refId);
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
        var fromQuery = fromVersion ? `AND version >= ${fromVersion}` : '';
        var toQuery = toVersion ? `AND version <= ${toVersion}` : '';
        
        var query = `SELECT * FROM ${this.tableName} 
            WHERE ref=$1 ${fromQuery} ${toQuery}
            ORDER BY version ASC
        `;

        let connectionResults = yield pg.connectAsync(this.config);
        let connection = connectionResults[0];
        let done = connectionResults[1];
        
        Promise.promisifyAll(connection, {context: pg});
        
        let result = yield connection.queryAsync(query, refId);
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
        var query = `SELECT MAX(version) AS version FROM ${this.tableName} WHERE ref=$1`;
        var done;
        
        if(!connection) {
            let connectionResults = yield pg.connectAsync(this.config);
            connection = connectionResults[0];
            done = connectionResults[1];
            
            Promise.promisifyAll(connection, {context: pg});
        }
        
        let result = yield connection.queryAsync(query, [refId]);
        let version = result.rows[0].version
        
        if(done) {
            done();
        }

        return version || 0;
    }  
}

exports = module.exports = PostgresSQLAdapter;
