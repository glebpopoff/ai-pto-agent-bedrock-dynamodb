const { DynamoDBClient, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { 
    DynamoDBDocumentClient, 
    PutCommand, 
    GetCommand, 
    UpdateCommand,
    DeleteCommand,
    ScanCommand
} = require('@aws-sdk/lib-dynamodb');
const { fromIni } = require('@aws-sdk/credential-provider-ini');
const StorageAdapter = require('./StorageAdapter');
const config = require('../config/storage').storage;

class DynamoDBAdapter extends StorageAdapter {
    constructor() {
        super();
        this.client = new DynamoDBClient({
            region: config.dynamodb.region,
            credentials: fromIni({ profile: process.env.AWS_PROFILE || 'my-app-profile' })
        });
        this.docClient = DynamoDBDocumentClient.from(this.client);
        this.tableName = config.dynamodb.tableName;
    }

    async createPTORecord(record) {
        try {
            const command = new PutCommand({
                TableName: this.tableName,
                Item: record
            });
            await this.docClient.send(command);
            return record;
        } catch (error) {
            if (error.name === 'ResourceNotFoundException') {
                // Auto-create table if it doesn't exist
                await this.createTable();
                // Retry the operation
                const command = new PutCommand({
                    TableName: this.tableName,
                    Item: record
                });
                await this.docClient.send(command);
                return record;
            }
            throw error;
        }
    }

    async getPTORecord(id) {
        try {
            const command = new GetCommand({
                TableName: this.tableName,
                Key: { id }
            });
            const response = await this.docClient.send(command);
            return response.Item;
        } catch (error) {
            if (error.name === 'ResourceNotFoundException') {
                await this.createTable();
                return null;
            }
            throw error;
        }
    }

    async updatePTORecord(id, record) {
        try {
            const updateExpr = 'set ';
            const attrNames = {};
            const attrValues = {};
            
            Object.keys(record).forEach((key, index) => {
                if (key !== 'id') {
                    updateExpr += `#${key} = :${key}${index < Object.keys(record).length - 1 ? ',' : ''}`;
                    attrNames[`#${key}`] = key;
                    attrValues[`:${key}`] = record[key];
                }
            });

            const command = new UpdateCommand({
                TableName: this.tableName,
                Key: { id },
                UpdateExpression: updateExpr,
                ExpressionAttributeNames: attrNames,
                ExpressionAttributeValues: attrValues,
                ReturnValues: 'ALL_NEW'
            });
            
            const response = await this.docClient.send(command);
            return response.Attributes;
        } catch (error) {
            if (error.name === 'ResourceNotFoundException') {
                await this.createTable();
                return await this.updatePTORecord(id, record);
            }
            throw error;
        }
    }

    async deletePTORecord(id) {
        try {
            const command = new DeleteCommand({
                TableName: this.tableName,
                Key: { id },
                ReturnValues: 'ALL_OLD'
            });
            const response = await this.docClient.send(command);
            return response.Attributes;
        } catch (error) {
            if (error.name === 'ResourceNotFoundException') {
                await this.createTable();
                return null;
            }
            throw error;
        }
    }

    async listPTORecords() {
        try {
            const command = new ScanCommand({
                TableName: this.tableName
            });
            const response = await this.docClient.send(command);
            return response.Items || [];
        } catch (error) {
            if (error.name === 'ResourceNotFoundException') {
                await this.createTable();
                return [];
            }
            throw error;
        }
    }

    async createTable() {
        const command = {
            TableName: this.tableName,
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        };
        
        try {
            await this.client.send(new CreateTableCommand(command));
            // Wait for table to be active
            await this.client.send({ TableName: this.tableName, for: 'tableExists' });
        } catch (error) {
            if (error.name !== 'ResourceInUseException') {
                throw error;
            }
        }
    }
}

module.exports = DynamoDBAdapter;
