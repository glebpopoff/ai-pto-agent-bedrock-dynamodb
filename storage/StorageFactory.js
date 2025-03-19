const DynamoDBAdapter = require('./DynamoDBAdapter');
const ExternalAPIAdapter = require('./ExternalAPIAdapter');
const config = require('../config/storage').storage;

class StorageFactory {
    static createStorage() {
        if (config.useExternalApi) {
            return new ExternalAPIAdapter();
        }
        return new DynamoDBAdapter();
    }
}

module.exports = StorageFactory;
