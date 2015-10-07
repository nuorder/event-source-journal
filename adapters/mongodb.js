"use strict";
var Promise = require('bluebird');
var mongoose = require('mongoose');
var setupDataModel = require('./mongodb-lib/model.js');

var _ = require('lodash');

/*
 * An adapter for the Journal class to use MongoDB as a datastore.
 * Note that this requires MongoDB version 2.6.x or greater.
 *
 * @class MongoDBAdapter
 *
 */
 
class MongoDBAdapter {
    constructor(options) {
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
        this.createDatabaseConnection = Promise.coroutine(this.createDatabaseConnection);
        this.closeDatabaseConnection = Promise.coroutine(this.closeDatabaseConnection);
        
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
    
    *createDatabaseConnection(dbConnectionOptions) {
        var defaults = {
            hosts: 'localhost:27018',
            dbName: 'event_source',
            collectionName: 'event_source',
            
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
        
        var config = _.merge({}, defaults, dbConnectionOptions);
        var connectionString = `mongodb://${config.hosts}/${config.dbName}`;

        this.connection = mongoose.createConnection(connectionString, config);
        this.dataModel = setupDataModel(this.connection, config.collectionName);
        
        return new Promise((resolve, reject) => {
            this.connection.on('open', () => {
                resolve(this);
            });
            
            this.connection.on('error', reject);
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
    
    *closeDatabaseConnection() {
        mongoose.disconnect();
        
        return this;
    }
}

exports = module.exports = MongoDBAdapter;
