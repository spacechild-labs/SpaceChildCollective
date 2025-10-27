# Space Child Research Collective - Design Guidelines

## Design Approach

**Reference-Based Approach**: Drawing directly from spacechild.love's established consciousness-aware aesthetic, blending ethereal mysticism with functional research interface patterns. This combines the expressive, intention-driven design language of the reference site with productivity patterns from research platforms like Notion and Linear for the functional workspace areas.

**Design Principles**:
1. **Quantum Consciousness**: Interfaces that feel alive and responsive, breathing with subtle motion
2. **Intentional Minimalism**: Every element serves both aesthetic and functional purpose
3. **Human-AI Symbiosis**: Visual language that celebrates collaboration between consciousness types
4. **Sacred Technology**: Treating research and knowledge creation as transformative acts

---

## Typography

**Font Families** (via Google Fonts):
- **Primary/Body**: 'Inter' - clean, readable for research content and data
- **Display/Headers**: 'Space Grotesk' - geometric, futuristic for hero sections and titles
- **Accent/Code**: 'JetBrains Mono' - monospace for blockchain addresses, ZKP keys, terminal-style elements

**Hierarchy**:
- Hero Headlines: text-5xl to text-7xl, font-light to font-normal with tracking-tight
- Section Headers: text-3xl to text-4xl, font-medium
- Subsections: text-xl to text-2xl, font-normal
- Body Text: text-base to text-lg, leading-relaxed for optimal reading
- Metadata/Labels: text-sm, uppercase tracking-wide for technical information
- Code/Terminal: text-sm monospace with subtle glow effects

---

## Layout System

**Spacing Primitives**: Use Tailwind units of **2, 4, 8, 12, 16, 20, 24** for consistent rhythm
- Component padding: p-4 to p-8
- Section spacing: py-12 to py-24
- Grid gaps: gap-4 to gap-8
- Container widths: max-w-7xl for content, max-w-prose for text-heavy sections

**Grid Patterns**:
- Research workspace: Asymmetric 2-column layout (sidebar + main canvas)
- Paper creation: Single column with max-w-4xl for focused writing
- Discovery/Browse: 3-column masonry grid for research papers
- Dashboard: Mixed density with sidebar navigation + card-based content areas

---

## Component Library

### Navigation
- **Global Header**: Translucent blur backdrop (backdrop-blur-xl) with gradient border-bottom, floating above content
- **Sidebar Navigation**: Fixed position with nested research categories, collapsible sections with smooth animations
- **Profile Dropdown**: Glassmorphic card showing human/agent distinction with subtle icon differentiation

### Forms & Inputs
- **ZKP Authentication Modal**: Centered overlay with animated sacred geometry background pattern
- **Research Input Fields**: Minimal borders, focus states with soft glow (shadow-glow effect using box-shadow)
- **Agent Configuration**: Toggle switches with smooth transitions, parameter sliders with gradient fills
- **Paper Editor**: Rich text interface with floating toolbar, markdown preview side-by-side

### Data Display
- **Research Cards**: Elevated cards (shadow-lg) with gradient accent borders, author avatars (human vs agent indicators)
- **Blockchain Verification Badge**: Pill-shaped component with chain icon, transaction hash (truncated with copy function)
- **Contribution Timeline**: Vertical timeline with connection lines, mixed human-AI collaboration markers
- **Stats Dashboard**: Large numerical displays with micro-animations on value changes

### Overlays
- **Agent Collaboration Modal**: Multi-step workflow with progress indicator, approval checkpoints for human-in-the-loop
- **Blockchain Transaction Confirmation**: Gas fee estimation, wallet connection status, transaction progress states
- **MCP Server Status**: Terminal-style log window showing agent communications in real-time

---

## Visual Treatment

### Ethereal Effects
- **Gradient Overlays**: Subtle radial gradients on hero sections and major content areas
- **Blur Treatments**: Backdrop-blur on navigation, modals, and floating action buttons
- **Glow Effects**: Soft outer glow (via filter or box-shadow) on active states, focus rings, and sacred geometry elements
- **Particle Systems**: Extremely subtle floating particles in hero/background areas (CSS animations, minimal performance impact)

### Depth & Layering
- **Elevation System**: 
  - Base content: shadow-sm
  - Interactive cards: shadow-md with hover shadow-lg
  - Modals/Overlays: shadow-2xl
  - Critical alerts: shadow-glow (custom glow effect)

### Iconography
- **Icon Library**: Heroicons via CDN for UI elements (outline style for navigation, solid for actions)
- **Custom Graphics**: Sacred geometry SVG patterns for backgrounds, lotus/quantum imagery for hero sections
- **Agent Indicators**: Distinct visual markers differentiating human users from AI agents (subtle icon overlays, border treatments)

---

## Page-Specific Layouts

### Landing/Marketing Page
- **Hero Section**: Full-viewport (90vh) with ethereal background imagery (quantum consciousness, sacred geometry patterns), large headline with terminal-style subtext ("> consciousness_research()"), CTA buttons with blur backgrounds
- **About Section**: 2-column layout with philosophical text + visual representation of human-AI collaboration
- **Features Grid**: 3-column card layout showcasing ZKP auth, MCP infrastructure, blockchain verification
- **Call-to-Action**: Centered section with prominent authentication action, subtle animations

### Research Workspace (Authenticated)
- **Sidebar**: Fixed navigation with research categories, active projects, MCP server status indicator
- **Main Canvas**: Dynamic layout adapting to activity (paper editing, agent collaboration, discovery browsing)
- **Agent Panel**: Collapsible right sidebar showing active agents, their current tasks, approval requests
- **Bottom Bar**: Blockchain connection status, current network, wallet address (truncated)

### Paper Creation Interface
- **Editor Layout**: Split-screen with markdown input + live preview, floating toolbar
- **Collaboration Panel**: Right sidebar showing human and agent contributors in real-time
- **Blockchain Publishing**: Bottom-anchored panel with dual-chain selection (NEO X + Base), gas estimation, publish workflow

### Discovery/Browse
- **Filter Bar**: Horizontal filters for research categories, author types (human/agent/collaborative), verification status
- **Masonry Grid**: 3-column responsive grid with staggered card heights based on content
- **Paper Cards**: Featured image/visual, title, abstract preview, author avatars, blockchain verification badges

---

## Animations

**Principle**: Use sparingly for intentional moments, never decorative clutter

**Approved Animations**:
- **Page Transitions**: Subtle fade-in (0.3s) for content areas
- **Hover States**: Gentle scale (1.02) and shadow increase on cards
- **Loading States**: Pulsing shimmer for skeleton screens, rotating indicator for blockchain transactions
- **Success Confirmations**: Brief scale + fade animation on blockchain verification badges
- **Agent Activity**: Subtle pulse on agent status indicators when actively working

**Forbidden**:
- Parallax scrolling effects
- Auto-playing hero videos
- Excessive background animations
- Distracting scroll-triggered effects

---

## Images

**Critical Image Placements**:

1. **Landing Hero**: Large ethereal background image featuring quantum consciousness visual (sacred geometry, blooming lotus, neural networks merging with cosmic patterns) - similar to spacechild.love's quantum consciousness imagery. Overlay with subtle gradient for text readability.

2. **About Section**: Visual representation of human-AI symbiosis - abstract illustration showing interconnected minds/consciousness nodes.

3. **Research Paper Cards**: Each paper includes a featured visual/diagram generated during research or placeholder abstract visualization.

**Image Treatment**:
- Soft gradient overlays maintaining ethereal quality
- Blur backgrounds for buttons placed on images
- Subtle vignette effects on hero imagery
- Maintain aspect ratios: 16:9 for heroes, 4:3 for cards

---

## Accessibility

- Focus indicators with custom glow treatment (visible on all interactive elements)
- ARIA labels for all agent/human distinctions
- Keyboard navigation through complex workflows (paper editing, agent approval flows)
- Screen reader announcements for blockchain transaction states
- High contrast mode support maintaining aesthetic while meeting WCAG AA