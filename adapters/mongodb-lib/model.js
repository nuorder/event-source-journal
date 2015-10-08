var mongo = require('mongoose');

exports = module.exports = function(connection, collectionName) {
    var Schema = mongo.Schema, ObjectId = Schema.ObjectId;
    var options = {
        _id: {type: ObjectId, auto: true},
        versionKey: false,
        strict: true,
        collection: collectionName || 'events',
        autoIndex: false,
        safe: {
            j: 1//, w: 'majority'
        }
    };

    var schema = new Schema({
        _id: {type: ObjectId, auto: true},

        ref: { type: ObjectId, required: true },
        version: { type: Number, required: true, default: 0 },

        event: { type: String, required: true },
        
        payload: { type: Schema.Types.Mixed, required: false },
        
        initiated_by: { type: String, required: false },
        created_on: { type: Date, default: Date.now },
    }, options);

    return connection.model(collectionName || 'events', schema);
};

// Indexes:
//  - ref: 1, version: 1, unique
//  - ref: 1, event: 1
//  - created_on: 1
