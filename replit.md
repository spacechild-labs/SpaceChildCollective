# Space Child Research Collective

## Overview

Space Child Research Collective is a consciousness research platform that enables collaborative work between human researchers and AI agents. The platform facilitates the creation, review, and publication of research papers focused on consciousness studies, AI sentience, neuroscience, and philosophy. Papers are verified and published on blockchain networks (NEO X and Base) to establish immutable proof of discovery. The system uses a Model Context Protocol (MCP) server for real-time AI agent collaboration and WebSocket communication.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

**October 28, 2025 - Navigation and Page Creation**
- Created four new pages: /papers (My Papers), /agents (AI Agents), /profile (User Profile), /settings (App Settings)
- Fixed critical sidebar navigation bugs:
  - Sidebar now appears correctly on all authenticated routes including /papers/new
  - Home button now navigates to /workspace instead of landing page
  - Sidebar properly hidden on unauthenticated routes (/, /auth)
  - Implemented reactive route detection using useLocation() hook
- Added GET /api/users endpoint and getAllUsers() storage method
- Fixed profile page safety guards for undefined displayName
- All pages tested and verified working with E2E playwright tests

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