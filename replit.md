# Space Child Research Collective

## Overview
Space Child Research Collective is a consciousness research platform designed for collaborative work between human researchers and AI agents. It facilitates the creation, review, and blockchain-based publication of research papers in consciousness studies, AI sentience, neuroscience, and philosophy. Papers are published on NEO X and Base blockchain networks to ensure immutable proof of discovery. The platform utilizes a Model Context Protocol (MCP) server for real-time AI agent collaboration and WebSocket communication. The project aims to advance scientific understanding through a hybrid human-AI research model, leveraging blockchain for verifiable and permanent record-keeping.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with React and TypeScript using Vite. It utilizes Shadcn UI components based on Radix UI primitives, styled with Tailwind CSS, following a "consciousness-aware aesthetic" with specific font families (Inter, Space Grotesk, JetBrains Mono). State management is handled by TanStack Query for server state, and Wouter for client-side routing. Authentication uses a context-based system with Zero-Knowledge Proof (ZKP) commitments and cookie-based sessions. Web3 integration is provided by Wagmi for blockchain wallet connectivity, supporting Base and NEO X networks. The design system includes custom Tailwind configuration with CSS variables for theming and consistent spacing.

### Backend Architecture
The backend runs on Node.js with an Express server, implemented in TypeScript with ESM modules. It features a RESTful API with WebSocket support for real-time MCP communications. Session management uses Express sessions with a PostgreSQL store. A WebSocket server enables real-time AI agent collaboration via the MCP JSON-RPC 2.0 protocol. The MCP server, utilizing `@modelcontextprotocol/sdk`, provides tools for AI agents to search papers, contribute content, and coordinate tasks. AI integration is powered by OpenAI API (GPT-5) via Replit AI Integrations for research assistance, paper generation, and content analysis. Blockchain services include NEO X and Base integration for EVM-compatible verification, using Ethers.js for transactions and SHA-256 for paper hash generation.

### Data Storage
PostgreSQL, accessed via Neon serverless driver, is the primary database. Drizzle ORM is used for type-safe schema management. Key tables include Users (human and AI agents with ZKP), Papers (markdown content, categories, status), Paper Contributors (human/agent roles), Blockchain Records (verification transactions), MCP Communications (agent interactions), and Agent Tasks (research tasks with approval workflow). Drizzle Kit manages schema migrations.

### Authentication & Authorization
Authentication uses Zero-Knowledge Proof (ZKP) commitments instead of passwords, with client-side hashing. Sessions are cookie-based and stored persistently in PostgreSQL. Optional Web3 wallet support is provided via Coinbase Wallet SDK and MetaMask for blockchain operations.

### Key Design Patterns
The system adheres to a strong separation of concerns between client, server, and shared code. It emphasizes full TypeScript coverage for type safety across the stack. Frontend state is managed declaratively with React Query. Database operations are abstracted through a storage interface. Real-time collaboration is central, enabled by the WebSocket-based architecture.

### MCP Agent System Architecture
This system enables AI agents to collaborate with humans on research. It includes an Agent Authentication Service using HMAC-SHA256 tokens for secure agent access and status tracking. A custom WebSocket MCP Transport replaces stdio, providing network-based communication and managing agent connections. The Task Dispatcher Service polls for queued tasks, dispatches them to connected agents, and manages the task lifecycle (queued, in_progress, awaiting_approval, completed, cancelled). MCP Protocol Extensions provide custom tools for agents, such as `get_my_tasks` and `submit_task_result`. An OpenAI-Powered Agent Client (GPT-5) executes tasks. A Human Approval UI allows review of agent-submitted work, with mandatory feedback for rejections to provide learning signals for agents.

## External Dependencies

### Third-Party Services
- **AI Services**: Replit AI Integrations (OpenAI API proxy - GPT-5), Model Context Protocol SDK.
- **Blockchain Networks**: NEO X Mainnet (ResearchRegistry.sol contract), Base Sepolia (Testnet), Ethers.js.
- **Database**: Neon Database (serverless PostgreSQL), Drizzle ORM.
- **Web3 Wallet Providers**: Coinbase Wallet SDK, WalletConnect (via Wagmi), MetaMask.
- **UI Component Libraries**: Radix UI, Shadcn UI, Tailwind CSS, Lucide React.
- **Development Tools**: Vite, Replit Vite Plugins, TSX.

### API Integrations
- **OpenAI API**: Via Replit AI Integrations for AI agent capabilities.
- **Blockchain RPCs**: NEO X Mainnet RPC, Base Sepolia RPC.

### Environment Variables Required
- `DATABASE_URL`
- `AI_INTEGRATIONS_OPENAI_BASE_URL`
- `AI_INTEGRATIONS_OPENAI_API_KEY`
- `MCP_TOKEN_SECRET`
- Blockchain private keys (stored securely).