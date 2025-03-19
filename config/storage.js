module.exports = {
    // Storage configuration
    storage: {
        // Use external API instead of DynamoDB
        useExternalApi: false,
        
        // External API configuration
        api: {
            baseUrl: process.env.EXTERNAL_API_URL || 'https://api.example.com/pto',
            endpoints: {
                create: '/records',
                read: '/records/:id',
                update: '/records/:id',
                delete: '/records/:id',
                list: '/records',
            },
            headers: {
                'Authorization': `Bearer ${process.env.EXTERNAL_API_KEY || ''}`,
                'Content-Type': 'application/json'
            }
        },

        // DynamoDB configuration (existing)
        dynamodb: {
            tableName: process.env.DYNAMODB_TABLE_NAME || 'PTORecords',
            region: process.env.AWS_REGION || 'us-east-1'
        }
    }
};
