require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { fromIni } = require("@aws-sdk/credential-provider-ini");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(bodyParser.json());

// Initialize AWS Bedrock client
const bedrockClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: fromIni({ profile: "openbook" })
});



const dynomoClient = new DynamoDBClient({
  region: "us-east-1",
  credentials: fromIni({ profile: "openbook" })
});

// In-memory storage for PTO records (replace with database in production)
let ptoRecords = [];

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

// API Endpoints
app.post('/api/pto/query', async (req, res) => {
    try {
        const { query } = req.body;
        const context = JSON.stringify(ptoRecords);
        const prompt = `Given the following PTO records: ${context}\n\nUser query: ${query}\n\nProvide a natural response about the PTO information.`;
        
        const response = await queryBedrock(prompt);
        res.json({ response });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/pto/schedule', async (req, res) => {
    try {
        const { request } = req.body;
        const context = JSON.stringify(ptoRecords);
        const prompt = `Given the following PTO records: ${context}\n\nUser request: ${request}\n\nParse this request and respond with a JSON object containing: startDate, endDate, type, and numberOfDays.`;
        
        const response = await queryBedrock(prompt);
        
        // Parse the AI response and add to records
        const ptoRequest = JSON.parse(response);
        ptoRecords.push({
            ...ptoRequest,
            id: Date.now().toString(),
            status: 'approved'
        });
        
        res.json({ message: 'PTO scheduled successfully', pto: ptoRequest });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/pto/update', async (req, res) => {
    try {
        const { request } = req.body;
        const context = JSON.stringify(ptoRecords);
        const prompt = `Given the following PTO records: ${context}\n\nUpdate request: ${request}\n\nIdentify the PTO to update and provide the new details as JSON.`;
        
        const response = await queryBedrock(prompt);
        const updateDetails = JSON.parse(response);
        
        // Update the matching record
        const recordIndex = ptoRecords.findIndex(record => 
            record.startDate === updateDetails.originalStartDate);
            
        if (recordIndex >= 0) {
            ptoRecords[recordIndex] = {
                ...ptoRecords[recordIndex],
                ...updateDetails.newDetails
            };
            res.json({ message: 'PTO updated successfully', pto: ptoRecords[recordIndex] });
        } else {
            res.status(404).json({ error: 'PTO record not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/pto/list', (req, res) => {
    res.json(ptoRecords);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
