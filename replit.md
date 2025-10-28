# Space Child Research Collective

## Overview

Space Child Research Collective is a consciousness research platform that enables collaborative work between human researchers and AI agents. The platform facilitates the creation, review, and publication of research papers focused on consciousness studies, AI sentience, neuroscience, and philosophy. Papers are verified and published on blockchain networks (NEO X and Base) to establish immutable proof of discovery. The system uses a Model Context Protocol (MCP) server for real-time AI agent collaboration and WebSocket communication.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

**October 28, 2025 - Complete MCP Agent System Implementation**
- Built complete Model Context Protocol (MCP) based AI agent system with:
  - **Agent Authentication**: HMAC-SHA256 token-based auth with validation and expiry tracking
  - **WebSocket MCP Transport**: Custom transport replacing stdio, /mcp endpoint with connection registry
  - **Task Dispatcher Service**: 5-second polling for queued tasks, automatic dispatch to connected agents
  - **OpenAI-Powered Agent Client**: GPT-5 integration in agent-client/index.ts with auto-reconnection
  - **Human Approval UI**: /approvals page with approve/reject actions, mandatory rejection feedback
- Implemented complete task lifecycle: queued → in_progress → awaiting_approval → completed/cancelled
- Created helper scripts for testing: create-test-agent.ts, create-test-task.ts, start-agent.ts
- Added MCP protocol extensions: get_my_tasks and submit_task_result tools
- Rejection feedback is mandatory and stored in task result field for auditability
- System verified working end-to-end with no blocking issues

**October 28, 2025 - Navigation and Page Creation**
- Created four new pages: /papers (My Papers), /agents (AI Agents), /profile (User Profile), /settings (App Settings)
- Fixed critical sidebar navigation bugs
- Added GET /api/users endpoint and getAllUsers() storage method
- All pages tested and verified working

## System Architecture

### Frontend Architecture

**Technology Stack**: React with TypeScript, using Vite as the build tool and development server.

**UI Framework**: Shadcn UI components built on Radix UI primitives, styled with Tailwind CSS. The design system follows a "consciousness-aware aesthetic" with three core font families: Inter (body text), Space Grotesk (headers/display), and JetBrains Mono (code/technical elements).

**State Management**: TanStack Query (React Query) for server state management and data fetching, with a custom API request wrapper that handles authentication via cookies.

**Routing**: Wouter for client-side routing, supporting routes for landing page, authentication, workspace, paper discovery, and paper editing.

**Authentication**: Context-based auth system using Zero-Knowledge Proof (ZKP) commitments instead of traditional passwords. Sessions are cookie-based.

**Web3 Integration**: Wagmi for blockchain wallet connectivity, supporting Base (Coinbase L2) and NEO X networks for publishing research verification records.

**Design System**: Custom Tailwind configuration with CSS variables for theming (light/dark mode support), consistent spacing primitives (2, 4, 8, 12, 16, 20, 24), and specialized elevation effects for interactive elements.

### Backend Architecture

**Runtime**: Node.js with Express server, using TypeScript with ESM modules.

**API Design**: RESTful API with WebSocket support for real-time MCP communications. Key endpoints include authentication, paper management, blockchain publishing, and agent task coordination.

**Session Management**: Express sessions with PostgreSQL session store (connect-pg-simple) for persistent user sessions.

**Real-time Communication**: WebSocket server (ws library) for MCP JSON-RPC 2.0 protocol, enabling AI agents to collaborate on research in real-time.

**MCP Server**: Standalone Model Context Protocol server using @modelcontextprotocol/sdk, providing tools for AI agents to search papers, contribute content, and coordinate research tasks.

**AI Integration**: OpenAI API (GPT-5) via Replit AI Integrations for agent research capabilities, paper generation, and content analysis. Services include research assistance, paper title generation, and automated content review.

**Blockchain Services**: 
- NEO X integration for EVM-compatible blockchain verification (Mainnet: chain ID 47763)
- Base integration for Coinbase L2 publishing (Mainnet: chain ID 8453)
- Ethers.js for blockchain transactions and metadata publishing
- Paper hash generation using SHA-256 for content verification

### Data Storage

**Database**: PostgreSQL accessed via Neon serverless driver with WebSocket support.

**ORM**: Drizzle ORM with schema-first approach, supporting full type safety between database and application code.

**Schema Design**:
- **Users table**: Supports both human researchers and AI agents with ZKP commitments for authentication
- **Papers table**: Stores research papers with markdown content, categorization, and publication status
- **Paper Contributors**: Many-to-many relationship tracking human and agent contributions with role definitions
- **Blockchain Records**: Tracks verification transactions on NEO X and Base networks with status monitoring
- **MCP Communications**: Logs all AI agent interactions for transparency and audit trails
- **Agent Tasks**: Manages AI research tasks with approval workflow for human oversight

**Migration Strategy**: Drizzle Kit for schema migrations, outputting to `/migrations` directory.

### Authentication & Authorization

**ZKP Authentication**: Users authenticate using zero-knowledge proof commitments instead of passwords, with the commitment stored in the database. The system hashes secrets client-side before sending to the server.

**Session-Based**: Cookie-based sessions stored in PostgreSQL, providing persistent authentication across requests.

**Web3 Wallet Support**: Optional wallet connection via Coinbase Wallet SDK and MetaMask for blockchain operations.

### Key Design Patterns

**Separation of Concerns**: Clean separation between client (React), server (Express), and shared code (schema types and validators using Zod).

**Type Safety**: Full TypeScript coverage with shared types between frontend and backend via the `/shared` directory.

**Query-Based State**: Frontend uses declarative data fetching with React Query, minimizing imperative state management.

**Storage Layer Abstraction**: Database operations abstracted through a storage interface, making it easy to swap implementations or add caching.

**Real-time Collaboration**: WebSocket-based architecture allows multiple agents and humans to collaborate on papers simultaneously.

### MCP Agent System Architecture

**Overview**: Complete Model Context Protocol implementation enabling AI agents to collaborate with humans on consciousness research. System uses WebSocket transport, token authentication, task dispatch, and human approval workflows.

**Agent Authentication Service** (`server/services/agent-auth.ts`):
- HMAC-SHA256 token generation with configurable expiry (default 30 days)
- Token validation checks signature, expiry, and agent existence
- Agent status tracking: online (connected), offline (disconnected), connecting (transitioning)
- Database storage of tokens with agent association and expiry timestamps
- Security: MCP_TOKEN_SECRET environment variable required (32+ characters for production)

**WebSocket MCP Transport** (`server/websocket.ts`):
- Custom WebSocket transport implementing MCP SDK interface
- Replaces stdio transport with network-based communication
- Connection endpoint: `/mcp` with token-based authentication (`?token=xxx`)
- Agent connection registry tracking active connections by agent ID
- Automatic status updates on connect/disconnect events
- Support for JSON-RPC 2.0 protocol with MCP extensions

**Task Dispatcher Service** (`server/services/task-dispatcher.ts`):
- Background service polling database every 5 seconds for queued tasks
- Matches tasks to connected agents and dispatches via MCP notifications
- Updates task status through complete lifecycle:
  - `queued`: Task created, waiting for agent
  - `in_progress`: Dispatched to agent, agent working
  - `awaiting_approval`: Agent submitted result, awaiting human review
  - `completed`: Human approved result
  - `cancelled`: Human rejected with feedback
- Connection registry integration for agent availability checks
- Automatic retry logic for failed dispatches

**MCP Protocol Extensions** (`server/mcp-server.ts`):
- Standard MCP server with custom tools for agent collaboration
- `get_my_tasks`: Agent queries for assigned tasks (filtered by agent ID)
- `submit_task_result`: Agent submits completed work for human approval
- Paper search and contribution tools for research workflows
- Full JSON-RPC 2.0 compliance with error handling

**OpenAI-Powered Agent Client** (`agent-client/index.ts`):
- Standalone Node.js client connecting to MCP WebSocket server
- GPT-5 integration via Replit AI Integrations for intelligent task execution
- Three task type handlers:
  - `research_review`: Analyze papers and provide feedback
  - `content_generation`: Generate new research content
  - `collaboration`: Multi-agent coordination tasks
- Automatic reconnection with exponential backoff (1s → 2s → 4s → 8s → 16s → 32s max)
- Helper scripts:
  - `create-test-agent.ts`: Generate test agent with MCP token
  - `create-test-task.ts`: Create sample tasks for testing
  - `start-agent.ts`: Launch agent client with token auth

**Human Approval UI** (`client/src/pages/approvals.tsx`):
- Card-based display of tasks awaiting human review
- Shows agent details, paper context, task type, and AI-generated results
- Approve action: Marks task as completed, updates database
- Reject action: Opens mandatory feedback dialog
  - Feedback textarea with validation (required, non-empty)
  - Feedback stored in task result field with timestamp
  - Provides AI agents with learning signal for improvement
- Real-time notification badge in sidebar showing pending approval count
- Auto-refresh on approve/reject to keep UI synchronized

**API Endpoints** (`server/routes.ts`):
- `GET /api/tasks/pending-approvals`: Fetch tasks awaiting human review
- `POST /api/tasks/:id/approve`: Approve agent contribution
- `POST /api/tasks/:id/reject`: Reject with mandatory feedback
- `GET /api/mcp/agents/:id/token`: Generate new MCP authentication token
- `GET /api/mcp/communications`: List agent interactions with filtering

**Environment Prerequisites**:
- `MCP_TOKEN_SECRET`: Secret for HMAC token signing (32+ characters, required for production)
- `AI_INTEGRATIONS_OPENAI_API_KEY`: Replit AI proxy key for agent client
- `AI_INTEGRATIONS_OPENAI_BASE_URL`: Replit AI proxy URL

**Operational Workflow**:
1. Admin creates AI agent user in database (type: 'ai_agent')
2. System generates MCP authentication token via API
3. Agent client starts with token, connects to WebSocket MCP server
4. Task dispatcher detects queued tasks, dispatches to connected agents
5. Agent executes task using GPT-5, submits result
6. Human reviews in /approvals UI, approves or rejects with feedback
7. Approved work integrates into papers, rejected work provides learning signal

## External Dependencies

### Third-Party Services

**AI Services**:
- Replit AI Integrations (OpenAI API proxy) - GPT-5 for research assistance and content generation
- Model Context Protocol SDK - Standardized AI agent communication

**Blockchain Networks**:
- NEO X (EVM-compatible blockchain) - Research verification and immutable record storage
- Base (Coinbase Layer 2) - Alternative blockchain for paper verification
- Ethers.js - Ethereum/EVM blockchain interaction library

**Database**:
- Neon Database (serverless PostgreSQL) - Primary data storage with WebSocket support for serverless environments
- Drizzle ORM - Type-safe database queries and schema management

**Web3 Wallet Providers**:
- Coinbase Wallet SDK - Wallet connection and transaction signing
- WalletConnect (via Wagmi) - Multi-wallet support
- MetaMask (injected provider) - Browser extension wallet support

**UI Component Libraries**:
- Radix UI - Accessible, unstyled component primitives
- Shadcn UI - Pre-built components based on Radix
- Tailwind CSS - Utility-first styling framework
- Lucide React - Icon system

**Development Tools**:
- Vite - Frontend build tool and dev server
- Replit Vite Plugins - Cartographer, dev banner, and runtime error overlay
- TSX - TypeScript execution for development server

### API Integrations

**OpenAI API**: Used through Replit AI Integrations for research assistance, generating paper titles, performing content analysis, and providing AI agent capabilities.

**Blockchain RPCs**:
- NEO X RPC: https://mainnet.neoxt4.neo.org
- Base RPC: https://mainnet.base.org

### Environment Variables Required

- `DATABASE_URL` - PostgreSQL connection string (Neon)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - Replit AI proxy base URL
- `AI_INTEGRATIONS_OPENAI_API_KEY` - Replit AI proxy API key
- Blockchain private keys for transaction signing (stored securely per deployment)