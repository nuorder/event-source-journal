"use strict";
//var ServiceDiscovery = require('./lib/service-discovery.js');
var Promise = require('bluebird');
var _ = require('lodash');

const privateData = new WeakMap();
const validAdapters = ['mongodb', 'sql', 'memory'];

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
}

exports = module.exports = Journal;
