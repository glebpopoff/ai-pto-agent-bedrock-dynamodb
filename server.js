require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const StorageFactory = require('./storage/StorageFactory');
const config = require('./config/storage').storage;
const { PTO_CATEGORIES, isValidPTOCategory, extractPTOCategory } = require('./utils/ptoCategories');
const { HOLIDAYS_2025, isWorkingDay, calculateWorkingDays, getHolidaysBetween } = require('./utils/holidayUtils');
const { parseRelativeDateRange } = require('./utils/dateUtils');

const app = express();
const port = process.env.PORT || 3000;

// Initialize AWS Bedrock client
const bedrockClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1'
});

// Initialize storage adapter
const storage = StorageFactory.createStorage();

// Middleware
app.use(express.static('public'));
app.use(bodyParser.json());

// Error handler middleware
app.use((err, req, res, next) => {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message });
});

// Helper function to get conversation history
function getConversationHistory(sessionId, maxMessages = 5) {
    if (!conversationHistory.has(sessionId)) {
        conversationHistory.set(sessionId, []);
    }
    return conversationHistory.get(sessionId).slice(-maxMessages);
}

// Helper function to add message to conversation history
function addToConversationHistory(sessionId, role, content) {
    if (!conversationHistory.has(sessionId)) {
        conversationHistory.set(sessionId, []);
    }
    conversationHistory.get(sessionId).push({ role, content });
}

// Initialize conversation history storage
const conversationHistory = new Map();

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

// Helper function to interact with Bedrock
async function queryBedrock(prompt, sessionId = 'default', includeHistory = true) {
    const messages = [];
    
    if (includeHistory) {
        const history = getConversationHistory(sessionId);
        messages.push(...history);
    }
    
    messages.push({
        role: "user",
        content: prompt
    });

    const payload = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1024,
        messages: messages
    };

    const command = new InvokeModelCommand({
        modelId: process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
        body: JSON.stringify(payload),
        contentType: "application/json",
        accept: "application/json",
    });

    try {
        const response = await bedrockClient.send(command);
        const responseData = JSON.parse(new TextDecoder().decode(response.body));
        
        // Add the AI's response to conversation history
        if (sessionId) {
            addToConversationHistory(sessionId, "assistant", responseData.content[0].text);
        }
        
        return responseData.content[0].text;
    } catch (error) {
        console.error('Bedrock API Error:', error);
        throw error;
    }
}

// Routes
app.post('/api/chat', async (req, res) => {
    try {
        const { message, context, sessionId = 'default' } = req.body;

        // Get existing PTO records for context
        const ptoRecords = await storage.listPTORecords();

        const payload = {
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 1024,
            messages: [{
                role: "user",
                content: `You are an AI PTO Manager. Current date is ${new Date().toISOString()}. 
                         Existing PTO records: ${JSON.stringify(ptoRecords)}. 
                         Previous context: ${JSON.stringify(context)}. 
                         User request: ${message}`
            }]
        };

        const command = new InvokeModelCommand({
            modelId: process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
            body: JSON.stringify(payload),
            contentType: "application/json",
            accept: "application/json",
        });

        const response = await bedrockClient.send(command);
        const responseData = JSON.parse(new TextDecoder().decode(response.body));

        res.json(responseData);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/pto/schedule', async (req, res) => {
    try {
        const { request, sessionId = 'default' } = req.body;
        const records = await storage.listPTORecords();
        
        // Add user's request to conversation history
        addToConversationHistory(sessionId, "user", request);
        
        // Extract PTO category from request if present
        const category = extractPTOCategory(request);
        
        // First try to parse relative dates from the request
        const dateRange = parseRelativeDateRange(request, new Date());
        
        if (dateRange) {
            const ptoRequest = {
                ...dateRange,
                type: category || 'Paid Time Off',
                id: Date.now().toString(),
                status: 'approved'
            };
            
            await storage.createPTORecord(ptoRequest);
            const response = `PTO scheduled successfully (${ptoRequest.numberOfDays} working day${ptoRequest.numberOfDays > 1 ? 's' : ''})${dateRange.holidayInfo || ''}`;
            
            // Add system's response to conversation history
            addToConversationHistory(sessionId, "assistant", response);
            
            res.json({ 
                message: response, 
                pto: ptoRequest 
            });
            return;
        }
        
        // If relative date parsing fails, fall back to AI
        const context = JSON.stringify({
            records,
            holidays: HOLIDAYS_2025,
            currentDate: new Date().toISOString(),
            conversationHistory: getConversationHistory(sessionId)
        });
        
        const prompt = `Given the following context:
- PTO records: ${JSON.stringify(records)}
- Holidays: ${JSON.stringify(HOLIDAYS_2025)}
- Current date: ${new Date().toISOString()}
- Previous conversation: ${JSON.stringify(getConversationHistory(sessionId))}

User request: ${request}

Parse this request considering the conversation history and respond with a JSON object containing:
- startDate: The start date (YYYY-MM-DD)
- endDate: The end date (YYYY-MM-DD)
- type: The PTO type (optional, default to "Paid Time Off")
- numberOfDays: Number of working days (excluding weekends and holidays)
- excludedDays: { weekends: true, holidays: true }

If the request is a follow-up to a previous question or refers to dates/information mentioned before, use the conversation history to understand the context.

Format your response as a markdown code block with JSON.`;
        
        const response = await queryBedrock(prompt, sessionId);
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

        // Set default type if not specified or invalid
        if (!ptoRequest.type || !isValidPTOCategory(ptoRequest.type)) {
            ptoRequest.type = 'Paid Time Off';
        }

        // Calculate working days between dates
        const startDate = new Date(ptoRequest.startDate);
        const endDate = new Date(ptoRequest.endDate);
        ptoRequest.numberOfDays = calculateWorkingDays(startDate, endDate);
        ptoRequest.excludedDays = { weekends: true, holidays: true };

        // Get holiday information
        const holidays = getHolidaysBetween(startDate, endDate);
        if (holidays.length > 0) {
            ptoRequest.holidayInfo = `\nNote: This period includes the following holidays:\n${holidays.map(h => `- ${h.name} (${h.date})`).join('\n')}`;
        }

        ptoRequest.id = Date.now().toString();
        ptoRequest.status = 'approved';
        
        await storage.createPTORecord(ptoRequest);
        const successResponse = `PTO scheduled successfully (${ptoRequest.numberOfDays} working day${ptoRequest.numberOfDays > 1 ? 's' : ''})${ptoRequest.holidayInfo || ''}`;
        
        // Add system's response to conversation history
        addToConversationHistory(sessionId, "assistant", successResponse);
        
        res.json({ 
            message: successResponse, 
            pto: ptoRequest 
        });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/pto/query', async (req, res) => {
    try {
        const { query, sessionId = 'default' } = req.body;
        const records = await storage.listPTORecords();
        
        // Add user's query to conversation history
        addToConversationHistory(sessionId, "user", query);
        
        const context = JSON.stringify({
            records,
            holidays: HOLIDAYS_2025,
            currentDate: new Date().toISOString(),
            conversationHistory: getConversationHistory(sessionId)
        });
        
        const prompt = `Given the following context:
- PTO records: ${JSON.stringify(records)}
- Holidays: ${JSON.stringify(HOLIDAYS_2025)}
- Current date: ${new Date().toISOString()}
- Previous conversation: ${JSON.stringify(getConversationHistory(sessionId))}

User query: ${query}

Provide a natural response about the PTO information, considering the conversation history. If the query refers to previous messages or questions, use the conversation history to provide context-aware responses. Include specific details about dates, types, and total days when relevant. If the response contains any JSON data, format it as a markdown code block.`;
        
        const response = await queryBedrock(prompt, sessionId);
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
        const { request, sessionId = 'default' } = req.body;
        const records = await storage.listPTORecords();
        
        // Add user's update request to conversation history
        addToConversationHistory(sessionId, "user", request);
        
        // Try to parse relative dates from the update request
        const dateRange = parseRelativeDateRange(request, new Date());
        
        if (dateRange) {
            // Find the most recent PTO record to update
            const recordToUpdate = records[records.length - 1];
            if (recordToUpdate) {
                await storage.updatePTORecord(recordToUpdate.id, dateRange);
                const updatedRecord = { ...recordToUpdate, ...dateRange };
                const response = `PTO updated successfully`;
                
                // Add system's response to conversation history
                addToConversationHistory(sessionId, "assistant", response);
                
                res.json({ 
                    message: response, 
                    pto: updatedRecord 
                });
                return;
            }
        }
        
        // If relative date parsing fails or no record found, fall back to AI
        const context = JSON.stringify({
            records,
            holidays: HOLIDAYS_2025,
            currentDate: new Date().toISOString(),
            conversationHistory: getConversationHistory(sessionId)
        });
        
        const prompt = `Given the following context:
- PTO records: ${JSON.stringify(records)}
- Holidays: ${JSON.stringify(HOLIDAYS_2025)}
- Current date: ${new Date().toISOString()}
- Previous conversation: ${JSON.stringify(getConversationHistory(sessionId))}

Update request: ${request}

Identify the PTO to update and provide the new details as JSON. Format your response as a markdown code block with JSON.`;
        
        const response = await queryBedrock(prompt, sessionId);
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
            await storage.updatePTORecord(recordToUpdate.id, updateDetails.newDetails);
            const updatedRecord = { ...recordToUpdate, ...updateDetails.newDetails };
            const successResponse = `PTO updated successfully`;
            
            // Add system's response to conversation history
            addToConversationHistory(sessionId, "assistant", successResponse);
            
            res.json({ 
                message: successResponse, 
                pto: updatedRecord 
            });
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
        const records = await storage.listPTORecords();
        res.json(records);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/pto/categories', (req, res) => {
    res.json(PTO_CATEGORIES);
});

app.get('/api/pto/holidays', (req, res) => {
    res.json(HOLIDAYS_2025);
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    
    // Log storage adapter type
    console.log(`Using ${config.useExternalApi ? 'External API' : 'DynamoDB'} storage adapter`);
});
