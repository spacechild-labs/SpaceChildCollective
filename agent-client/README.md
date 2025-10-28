# OpenAI-Powered AI Agent Client for MCP

## Overview

This is a standalone Node.js application that acts as an AI research agent, connects to the MCP (Model Context Protocol) WebSocket server, receives tasks, and executes them using OpenAI API.

## Features

- ✅ **MCP WebSocket Connection**: Connects to MCP server at `ws://localhost:5000/mcp` with token authentication
- ✅ **Bidirectional Communication**: Uses MCP SDK client with WebSocket transport
- ✅ **Task Execution**: Processes research, writing, analysis, and review tasks
- ✅ **OpenAI Integration**: Uses GPT-5 via Replit's AI Integrations
- ✅ **Automatic Reconnection**: Reconnects on disconnect with exponential backoff
- ✅ **Error Handling**: Retries failed OpenAI requests, handles errors gracefully
- ✅ **Comprehensive Logging**: Logs all actions for debugging

## Architecture

### Components

1. **WebSocketClientTransport** (`agent-client/index.ts`)
   - Implements MCP SDK Transport interface
   - Handles WebSocket connection lifecycle
   - Queues messages until connection is ready
   - Supports bidirectional JSON-RPC messaging

2. **AIAgentClient** (`agent-client/index.ts`)
   - Main agent client class
   - Connects to MCP server with authentication
   - Listens for task notifications
   - Processes tasks using OpenAI
   - Submits results back to server

3. **Helper Scripts** (`scripts/`)
   - `create-test-agent.ts` - Creates test agents and generates tokens
   - `generate-agent-token.ts` - Generates MCP tokens for existing agents
   - `create-test-task.ts` - Creates test tasks for agents

## Installation

All required packages are already installed:
- `@modelcontextprotocol/sdk` - MCP client SDK
- `ws` - WebSocket library
- `openai` - OpenAI API client
- `drizzle-orm` - Database ORM

## Usage

### 1. Create an Agent

```bash
tsx scripts/create-test-agent.ts
```

This creates a test agent and generates an MCP token.

### 2. Run the Agent Client

```bash
tsx agent-client/index.ts <agentId>
```

Example:
```bash
tsx agent-client/index.ts a429c82b-cbf1-4320-8e4b-138b93f059e0
```

### 3. Create a Task

In another terminal:

```bash
tsx scripts/create-test-task.ts <agentId>
```

The agent will automatically:
1. Receive the task notification
2. Process it using OpenAI API
3. Submit the results back to the server

## Task Types

The agent supports four task types:

### 1. Literature Review (`research`)
- Conducts comprehensive literature reviews
- Identifies key research papers and studies
- Summarizes major findings and theories
- Provides academic citations

### 2. Citation Check (`analysis` or `review`)
- Verifies citation formatting
- Checks accuracy of referenced information
- Identifies missing citations
- Suggests additional relevant citations

### 3. Content Generation (`writing`)
- Generates academic-quality research content
- Maintains scholarly tone
- Includes proper transitions and flow
- Identifies areas needing citations

## Configuration

### Environment Variables

The agent client uses these environment variables:

- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key (provided by Replit)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL (provided by Replit)
- `MCP_SERVER_URL` - MCP WebSocket server URL (default: `ws://localhost:5000/mcp`)
- `DATABASE_URL` - PostgreSQL connection string

### Command-Line Arguments

```bash
tsx agent-client/index.ts <agentId>
```

- `<agentId>` - The ID of the agent to run (required)

## How It Works

### 1. Connection Flow

```
Agent Client                MCP Server               Task Dispatcher
     |                           |                          |
     |-- WebSocket Connect ----->|                          |
     |    (with token)            |                          |
     |                            |-- Validate Token ------->|
     |                            |                          |
     |<----- Connected -----------|                          |
     |                            |                          |
     |                            |<-- Agent Online ---------|
     |                            |                          |
     |<-- Task Notification ------|<-- Dispatch Task --------|
     |                            |                          |
```

### 2. Task Processing Flow

```
1. Agent receives task notification via WebSocket
2. Agent extracts task details (type, description, etc.)
3. Agent calls OpenAI API with task-specific prompt
4. OpenAI processes request and returns result
5. Agent formats result based on task type
6. Agent submits result using MCP tool: submit_task_result
7. Server updates task status (awaiting_approval or completed)
```

### 3. Task Result Format

Results include:
- **taskId**: ID of the completed task
- **agentId**: ID of the agent
- **completedAt**: Timestamp
- **content**: Raw OpenAI response
- **type**: Task type (literature_review, citation_check, content_generation)
- **Type-specific fields**:
  - Literature Review: `summary`, `citations`, `keyFindings`
  - Citation Check: `analysis`, `issues`, `suggestions`
  - Content Generation: `generatedContent`, `citationNeeds`

## Error Handling

### Reconnection

- Automatic reconnection on disconnect
- Exponential backoff (5s, 10s, 20s, ...)
- Max 5 reconnection attempts
- Fetches fresh token from database on reconnect

### OpenAI Retry Logic

- Max 3 retry attempts per request
- Exponential backoff (2s, 4s, 8s)
- Detailed error logging

### Error Result Submission

If a task fails, the agent submits an error result with:
- Error message
- Status: "failed"
- No human approval required

## Logging

The agent logs all actions:

```
🚀 Starting AI Agent Client
✅ Agent connected successfully
📋 Received task: <taskId> (<taskType>)
🤖 Processing task...
🧠 Calling OpenAI for <taskType>...
✅ OpenAI response received
📤 Submitting result for task...
✅ Task completed successfully
```

## Development

### Testing the Agent

1. **Create a test agent**:
   ```bash
   tsx scripts/create-test-agent.ts
   ```

2. **Start the agent client**:
   ```bash
   tsx agent-client/index.ts <agentId>
   ```

3. **Create a test task** (in another terminal):
   ```bash
   tsx scripts/create-test-task.ts <agentId>
   ```

4. **Observe the agent processing the task** in the agent client terminal

### Generating Tokens

To generate a new token for an existing agent:

```bash
tsx scripts/generate-agent-token.ts <agentId>
```

Tokens are valid for 24 hours and stored in the database.

## Troubleshooting

### "Agent not found"

Make sure the agent exists in the database. Create one using:
```bash
tsx scripts/create-test-agent.ts
```

### "No valid token found"

Generate a token using:
```bash
tsx scripts/generate-agent-token.ts <agentId>
```

### WebSocket connection fails

1. Make sure the server is running (`npm run dev`)
2. Check that the MCP WebSocket server is initialized (look for "MCP WebSocket server initialized" in logs)
3. Verify the agent has a valid token

### Task not being received

1. Make sure the task is created with status "queued"
2. Check that the agent is connected (look for "Agent registered" in server logs)
3. Verify the task dispatcher is running (should log every 5 seconds)

## Integration with Main Application

The agent client is designed to run as a separate process from the main application server:

1. **Server** (`npm run dev`) - Runs the MCP server and task dispatcher
2. **Agent** (`tsx agent-client/index.ts <agentId>`) - Runs the agent client

Multiple agents can connect simultaneously, each processing their assigned tasks.

## Security

- **Token-based authentication**: MCP tokens are HMAC-signed and validated
- **Token expiration**: Tokens expire after 24 hours
- **Secure WebSocket**: Uses token in query parameter or x-mcp-token header
- **Database validation**: Agent existence and type verified before connection

## Future Improvements

- [ ] Support for streaming OpenAI responses
- [ ] Better error recovery and retry strategies
- [ ] Metrics and monitoring
- [ ] Support for multiple concurrent tasks
- [ ] Agent health checks and heartbeat
- [ ] Task priority queue
- [ ] Dynamic agent scaling
