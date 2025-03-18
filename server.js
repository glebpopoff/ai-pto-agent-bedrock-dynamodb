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
app.post('/api/pto/query', async (req, res) => {
    try {
        const { query } = req.body;
        const context = JSON.stringify(ptoRecords);
        const prompt = `Given the following PTO records: ${context}\n\nUser query: ${query}\n\nProvide a natural response about the PTO information. If the response contains any JSON data, format it as a markdown code block.`;
        
        const response = await queryBedrock(prompt);
        let result;
        
        // Check if the response contains a JSON block
        try {
            result = extractJsonFromResponse(response);
        } catch {
            // If no JSON block found, use the text response
            result = { response };
        }
        
        res.json(result);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/pto/schedule', async (req, res) => {
    try {
        const { request } = req.body;
        const context = JSON.stringify(ptoRecords);
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
        ptoRecords.push(ptoRequest);
        
        res.json({ message: 'PTO scheduled successfully', pto: ptoRequest });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/pto/update', async (req, res) => {
    try {
        const { request } = req.body;
        const context = JSON.stringify(ptoRecords);
        const prompt = `Given the following PTO records: ${context}\n\nUpdate request: ${request}\n\nIdentify the PTO to update and provide the new details as JSON. Format your response as a markdown code block with JSON.`;
        
        const response = await queryBedrock(prompt);
        let updateDetails;
        
        try {
            updateDetails = extractJsonFromResponse(response);
        } catch (parseError) {
            console.error('Error parsing update details:', parseError);
            throw new Error('Could not parse the AI response');
        }

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
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/pto/list', (req, res) => {
    res.json(ptoRecords);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
