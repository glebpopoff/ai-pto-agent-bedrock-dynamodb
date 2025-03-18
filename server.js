require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { DynamoDBClient, CreateTableCommand, PutItemCommand, QueryCommand, ScanCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { fromIni } = require("@aws-sdk/credential-provider-ini");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(bodyParser.json());

// AWS configuration
const awsConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: fromIni({ profile: "openbook" })
};

// Initialize AWS clients
const bedrockClient = new BedrockRuntimeClient(awsConfig);
const dynamoClient = new DynamoDBClient(awsConfig);

// DynamoDB table name
const tableName = 'OB-PTORecords-POC';

// Initialize DynamoDB table
async function initializeDynamoDB() {
    try {
        const createTableCommand = new CreateTableCommand({
            TableName: tableName,
            KeySchema: [
                { AttributeName: 'id', KeyType: 'HASH' }
            ],
            AttributeDefinitions: [
                { AttributeName: 'id', AttributeType: 'S' }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        });

        await dynamoClient.send(createTableCommand);
        console.log('DynamoDB table created successfully');
    } catch (error) {
        if (error.name === 'ResourceInUseException') {
            console.log('DynamoDB table already exists');
        } else {
            console.error('Error creating DynamoDB table:', error);
        }
    }
}

// DynamoDB operations
async function savePTORecord(ptoRecord) {
    try {
        const command = new PutItemCommand({
            TableName: tableName,
            Item: {
                id: { S: ptoRecord.id },
                startDate: { S: ptoRecord.startDate },
                endDate: { S: ptoRecord.endDate },
                type: { S: ptoRecord.type },
                numberOfDays: { N: ptoRecord.numberOfDays.toString() },
                status: { S: ptoRecord.status }
            }
        });

        await dynamoClient.send(command);
    } catch (error) {
        console.error('Error saving PTO record:', error);
        if (error.name === 'ResourceNotFoundException') {
            console.log('Table not found, creating...');
            await initializeDynamoDB();
            // Retry the save operation
            await dynamoClient.send(command);
        } else {
            throw error;
        }
    }
}

async function getAllPTORecords() {
    try {
        const command = new ScanCommand({
            TableName: tableName
        });

        const response = await dynamoClient.send(command);
        return (response.Items || []).map(item => ({
            id: item.id.S,
            startDate: item.startDate.S,
            endDate: item.endDate.S,
            type: item.type.S,
            numberOfDays: parseInt(item.numberOfDays.N),
            status: item.status.S
        }));
    } catch (error) {
        console.error('Error getting PTO records:', error);
        if (error.name === 'ResourceNotFoundException') {
            console.log('Table not found, creating...');
            await initializeDynamoDB();
            return [];
        }
        throw error;
    }
}

async function updatePTORecord(id, updates) {
    try {
        const updateExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        
        Object.entries(updates).forEach(([key, value]) => {
            if (key !== 'id') {
                updateExpressions.push(`#${key} = :${key}`);
                expressionAttributeNames[`#${key}`] = key;
                expressionAttributeValues[`:${key}`] = 
                    typeof value === 'number' ? { N: value.toString() } :
                    typeof value === 'boolean' ? { BOOL: value } :
                    { S: value };
            }
        });

        const command = new UpdateItemCommand({
            TableName: tableName,
            Key: { id: { S: id } },
            UpdateExpression: `SET ${updateExpressions.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues
        });

        await dynamoClient.send(command);
    } catch (error) {
        console.error('Error updating PTO record:', error);
        if (error.name === 'ResourceNotFoundException') {
            console.log('Table not found, creating...');
            await initializeDynamoDB();
            // Retry the update operation
            await dynamoClient.send(command);
        } else {
            throw error;
        }
    }
}

// Initialize DynamoDB on startup
initializeDynamoDB().catch(console.error);

// Helper function to interact with Bedrock
async function queryBedrock(prompt) {
    const payload = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 512,
        temperature: 0.7,
        messages: [
            {
                role: "user",
                content: prompt
            }
        ]
    };

    const command = new InvokeModelCommand({
        modelId: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
        body: JSON.stringify(payload),
        contentType: "application/json",
        accept: "application/json",
    });

    try {
        console.log('Sending request to Bedrock:', { modelId: command.input.modelId, prompt });
        const response = await bedrockClient.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        console.log('Bedrock response:', responseBody);
        return responseBody.content[0].text;
    } catch (error) {
        console.error('Error calling Bedrock:', {
            name: error.name,
            message: error.message,
            code: error.$metadata?.httpStatusCode
        });
        throw error;
    }
}

// Helper function to extract JSON from markdown response
function extractJsonFromResponse(response) {
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
        try {
            return JSON.parse(jsonMatch[1]);
        } catch (error) {
            console.error('Error parsing extracted JSON:', error);
            throw new Error('Failed to parse JSON from response');
        }
    }
    throw new Error('No JSON found in response');
}

// API Endpoints
app.post('/api/pto/schedule', async (req, res) => {
    try {
        const { request } = req.body;
        const records = await getAllPTORecords();
        const context = JSON.stringify(records);
        const prompt = `Given the following PTO records: ${context}\n\nUser request: ${request}\n\nParse this request and respond with a JSON object containing: startDate, endDate, type, and numberOfDays. Format your response as a markdown code block with JSON.`;
        
        const response = await queryBedrock(prompt);
        let ptoRequest;
        
        try {
            ptoRequest = extractJsonFromResponse(response);
        } catch (parseError) {
            console.error('Error parsing PTO request:', parseError);
            throw new Error('Could not parse the AI response into a valid PTO request');
        }

        if (!ptoRequest.startDate || !ptoRequest.endDate) {
            throw new Error('Invalid PTO request format from AI');
        }

        ptoRequest.id = Date.now().toString();
        ptoRequest.status = 'approved';
        
        await savePTORecord(ptoRequest);
        res.json({ message: 'PTO scheduled successfully', pto: ptoRequest });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/pto/query', async (req, res) => {
    try {
        const { query } = req.body;
        const records = await getAllPTORecords();
        const context = JSON.stringify(records);
        const prompt = `Given the following PTO records: ${context}\n\nUser query: ${query}\n\nProvide a natural response about the PTO information. If the response contains any JSON data, format it as a markdown code block.`;
        
        const response = await queryBedrock(prompt);
        let result;
        
        try {
            result = extractJsonFromResponse(response);
        } catch {
            result = { response };
        }
        
        res.json(result);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/pto/update', async (req, res) => {
    try {
        const { request } = req.body;
        const records = await getAllPTORecords();
        const context = JSON.stringify(records);
        const prompt = `Given the following PTO records: ${context}\n\nUpdate request: ${request}\n\nIdentify the PTO to update and provide the new details as JSON. Format your response as a markdown code block with JSON.`;
        
        const response = await queryBedrock(prompt);
        let updateDetails;
        
        try {
            updateDetails = extractJsonFromResponse(response);
        } catch (parseError) {
            console.error('Error parsing update details:', parseError);
            throw new Error('Could not parse the AI response');
        }

        const recordToUpdate = records.find(record => 
            record.startDate === updateDetails.originalStartDate);

        if (recordToUpdate) {
            await updatePTORecord(recordToUpdate.id, updateDetails.newDetails);
            const updatedRecord = { ...recordToUpdate, ...updateDetails.newDetails };
            res.json({ message: 'PTO updated successfully', pto: updatedRecord });
        } else {
            res.status(404).json({ error: 'PTO record not found' });
        }
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/pto/list', async (req, res) => {
    try {
        const records = await getAllPTORecords();
        res.json(records);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
