# AI PTO Manager

An AI-powered PTO management system using AWS Bedrock and Node.js.

## Features
- Natural language PTO scheduling and queries
- PTO management (create, update, view)
- AWS Bedrock integration for AI processing
- Simple web interface

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure AWS credentials:
- Copy `.env.example` to `.env`
- Add your AWS credentials and configuration
- Ensure your AWS account has access to Bedrock and the Claude v2 model

3. Start the server:
```bash
npm start
```

## Usage

Access the web interface at `http://localhost:3000`. You can:
- Schedule PTO by typing requests like "Schedule PTO for April 1-2"
- Query PTO information like "How many days have I taken in 2025?"
- Update existing PTO with requests like "Update my PTO on April 1 to 2 days"

## AWS Deployment

The application is ready for AWS deployment. Recommended options:
- AWS Elastic Beanstalk
- AWS ECS with Fargate
- AWS Lambda with API Gateway (requires code modifications)

## Security Note
Never commit your `.env` file or expose AWS credentials in your code.
