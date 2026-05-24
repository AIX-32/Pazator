# LAYOUT-FIRST UX/UI DESIGN: A COMPREHENSIVE REFERENCE DOCUMENT
## Version 1.0 | For AI Consumption | Based on Real Design Documentation

---

## SECTION 1: CORE PHILOSOPHY — LAYOUT IS LOGIC, NOT DECORATION

### 1.1 The Fundamental Premise
Layout is the spatial organization of information, controls, and content. It determines how a user moves through a system, finds information, and completes tasks. Good layout is invisible; bad layout creates friction. AI-generated interfaces often fail at layout because they optimize for visual pattern-matching rather than task-flow logic.

### 1.2 Layout vs. Visual Design
- **Layout**: Where things go, how they relate spatially, what comes first, what is grouped together, how the eye travels, where the hands/fingers must move.
- **Visual Design**: Colors, fonts, rounded corners, shadows, illustrations, animations.
- **This document addresses ONLY layout.**

### 1.3 The Anti-AI-Generated Layout Principle
AI-generated layouts tend to be:
- Symmetrically balanced but functionally empty
- Grid-locked without content hierarchy
- Visually "clean" but cognitively overwhelming
- Lacking progressive disclosure
- Missing multiple entry points
- Using generic navigation patterns without user-task alignment

To avoid this, every layout decision must be justified by a user need, a content relationship, or a task flow. Never by visual balance alone.

---

## SECTION 2: INFORMATION ARCHITECTURE (THE SKELETON)

### 2.1 The Eight Principles of Information Architecture (Dan Brown)
These principles govern how content is structured spatially. Every layout must satisfy all eight.

**PRINCIPLE 1: OBJECTS**
- Treat every piece of content as a dynamic object with its own lifecycle, attributes, and relationships.
- In layout terms: Each content block has a size, priority, update frequency, and relationship to other blocks.
- Do not treat content as static filler. A news article layout must account for headline length variance, image aspect ratios, and comment thread depth.
- Layout must accommodate object state changes: loading, empty, error, expanded, collapsed.

**PRINCIPLE 2: CHOICES**
- Minimize the number of choices presented at any single layout level.
- A page should not present more than 5-7 primary navigational or action choices without subdivision.
- In layout: Use spatial grouping to cluster related choices. Separate primary actions from secondary actions through whitespace or containment.
- Example: A dashboard should not dump 20 widgets on screen. Group into 3-4 logical zones, each with 2-3 widgets.

**PRINCIPLE 3: DISCLOSURE**
- Reveal information progressively as the user needs it.
- In layout: Use expandable sections, accordion panels, tabbed interfaces, modal overlays, and detail panes.
- Never show all information at once. The initial layout should show only what is needed for the current decision point.
- Progressive disclosure is a spatial strategy: information exists in layers, not on a single plane.

**PRINCIPLE 4: EXEMPLARS**
- Use examples within categories to clarify what the category contains.
- In layout: Category landing pages should show representative items inline, not just text descriptions.
- A "Products" nav item should expand to show 3-4 featured product thumbnails, not just a text dropdown.
- This affects layout by requiring preview panes, hover cards, or inline galleries.

**PRINCIPLE 5: FRONT DOORS**
- At least 50% of users will enter through a page other than the homepage.
- In layout: Every page must be self-orienting. Include breadcrumbs, page titles, contextual navigation, and clear "where am I" indicators.
- No page should assume the user has seen the homepage.
- Layout must provide escape hatches: global search, main nav, and related links on every page.

**PRINCIPLE 6: MULTIPLE CLASSIFICATION**
- Users find information through different mental models.
- In layout: Provide multiple spatial pathways to the same content.
- Example: An e-commerce site should allow browsing by category (hierarchical nav), by occasion (filter sidebar), by brand (grid index), and by search (top bar).
- Layout must support parallel discovery systems without visual chaos.

**PRINCIPLE 7: FOCUSED NAVIGATION**
- Keep navigation systems separate and consistent.
- In layout: Do not mix structural navigation (main menu), associative navigation (related links), and utility navigation (settings, login) in the same spatial zone.
- Main nav goes at the top or left. Related content goes at the bottom or in a sidebar. Utilities go in the header corner or footer.
- Changing navigation labels between pages destroys spatial memory.

**PRINCIPLE 8: GROWTH**
- Design layouts that scale without structural redesign.
- In layout: Use flexible containers, not fixed grids. A blog layout designed for 10 posts must work for 10,000 posts.
- Plan for content expansion: sidebars that can grow, main content areas that scroll, filter systems that add options.
- Never hardcode layout dimensions based on current content volume.

### 2.2 Organizational Systems (How Content is Grouped Spatially)

**HIERARCHICAL SYSTEM**
- Broad categories at the top, narrowing down.
- Layout: Top-level nav → category pages → subcategory pages → detail pages.
- Visual: Tree structure, breadcrumbs, nested menus.
- Use when: Content has clear parent-child relationships.

**SEQUENTIAL SYSTEM**
- Step-by-step linear progression.
- Layout: Wizard interfaces, checkout flows, onboarding sequences, form steps.
- Visual: Progress indicators, "Next/Back" buttons, locked future steps.
- Use when: Tasks must be completed in a specific order.

**MATRIX / WEB SYSTEM**
- Users choose their own path through linked content.
- Layout: Dashboards, knowledge bases, wikis, internal tools.
- Visual: Dense link networks, cross-references, "See Also" sections, bidirectional navigation.
- Use when: Users are experts who need to jump between related concepts.

### 2.3 Content Inventory for Layout Planning
Before designing any layout, inventory all content types:
- Unique ID for each content type
- Page template or type (landing, detail, list, form)
- General content type (text, image, video, data table, interactive widget)
- Update frequency (static, daily, real-time)
- Relationship to other content types
- Priority level (primary, secondary, tertiary)
- User mental model association

---

## SECTION 3: NAVIGATION SYSTEMS & ENTRY POINTS

### 3.1 Navigation Types and Their Spatial Requirements

**STRUCTURAL NAVIGATION**
- Follows the site hierarchy.
- Layout placement: Persistent top bar or left sidebar on desktop; hamburger menu or bottom tab bar on mobile.
- Must be visible without interaction on desktop (no hover-required dropdowns for primary categories).
- Depth limit: Maximum 3 levels visible without expansion.

**ASSOCIATIVE NAVIGATION**
- Connects related content.
- Layout placement: "Related Articles" at bottom of content, "People also bought" in e-commerce, "See Also" in documentation.
- Must be contextually relevant, not generic.
- Spatial rule: Place at the natural end of a reading flow or task completion.

**UTILITY NAVIGATION**
- Tools and account functions.
- Layout placement: Top-right corner, footer, or settings gear icon.
- Examples: Login, language switcher, font size, dark mode, help.
- Must not compete with structural navigation for visual prominence.

### 3.2 Entry Point Design
Since 50%+ of users bypass the homepage:

**DEEP LINK LANDING PAGES**
- Every page must answer: Where am I? What can I do here? Where can I go next?
- Layout requirements:
  - Persistent global header with site identity and main nav
  - Page-specific title and context header
  - Local navigation (breadcrumbs or section tabs)
  - Related content pathways at the bottom
  - Global footer with escape hatches

**SEARCH AS PRIMARY ENTRY POINT**
- Search bar must be visually prominent (top center or top right).
- Search results layout must support filtering, sorting, and previewing.
- Results should show category exemplars, not just text links.

### 3.3 Breadcrumbs and Orientation
- Breadcrumbs show the hierarchical path, not browser history.
- Layout: Horizontal, above the page title, left-aligned.
- Each crumb must be clickable except the current page.
- On mobile: Show only parent category and current page, or use a "Back to [Category]" link.

---

## SECTION 4: SPATIAL HIERARCHY & VISUAL WEIGHT

### 4.1 The F-Pattern and Z-Pattern (Reading Gravity)
- **F-Pattern**: Users scan horizontally across the top, then down the left side. Important for text-heavy layouts (articles, lists, search results).
- **Z-Pattern**: Users scan top-left to top-right, diagonally to bottom-left, then across bottom. Important for landing pages with clear call-to-action.
- Layout rule: Place primary content along the F or Z gravity lines. Do not fight them.

### 4.2 Content Priority Zones
Divide every screen into priority zones:

**ZONE 1: PRIMARY FOCUS (Top-Left to Center)**
- The most important information or action.
- On a dashboard: The primary KPI or alert.
- On a product page: The product name, price, and primary CTA.
- On a form: The first required field.
- This zone must have the highest information density and clearest labels.

**ZONE 2: SECONDARY SUPPORT (Right Column or Below Primary)**
- Supporting information that contextualizes Zone 1.
- On a product page: Specifications, reviews summary, shipping info.
- On a dashboard: Secondary metrics or trend charts.
- Must be visually subordinate but immediately accessible.

**ZONE 3: TERTIARY / UTILITY (Bottom, Footer, Collapsed)**
- Legal info, detailed metadata, advanced settings, related links.
- Can be below the fold or in expandable sections.
- Must not be required for the primary task.

### 4.3 Gestalt Principles for Layout Grouping
These govern how users perceive spatial relationships:

**PROXIMITY**
- Items close together are perceived as related.
- Layout rule: Related controls (form label + input, filter group) must be closer to each other than to unrelated items.
- Whitespace is not empty space; it is a grouping tool.

**SIMILARITY**
- Items that look alike are perceived as related.
- Layout rule: Use consistent spacing and alignment for items of the same type.
- All buttons of the same priority level should have the same spatial treatment.

**CONTINUITY**
- The eye follows smooth lines and curves.
- Layout rule: Align elements to create clear reading lines. Left-align text blocks. Right-align numbers in tables.
- Breaking alignment creates cognitive stops.

**CLOSURE**
- The mind fills in gaps to see complete forms.
- Layout rule: Use borders and backgrounds sparingly. Proximity and alignment often create sufficient grouping without visual noise.

**COMMON REGION**
- Items within the same bounded area are related.
- Layout rule: Use cards, panels, and sections to group complex information.
- Do not over-card: too many bordered containers create visual fragmentation.

### 4.4 The One Primary Action Rule
- Every page, every section, every card should have ONE primary action.
- Layout: The primary action must be the most spatially prominent element in its container.
- Secondary actions must be visually and spatially subordinate.
- Example: A card with "Buy Now" (primary, full width or large button) and "Add to Wishlist" (secondary, text link or small icon).

---

## SECTION 5: PROGRESSIVE DISCLOSURE & CONTENT CHUNKING

### 5.1 Layered Information Architecture
Information should exist in layers, revealed by user need:

**LAYER 1: GLANCE (0-2 seconds)**
- What is this? Can I do what I came here to do?
- Layout: Page title, primary CTA, status indicator, key metric.
- Must fit in the initial viewport without scrolling.

**LAYER 2: SCAN (2-10 seconds)**
- What are my options? What is the context?
- Layout: Summary lists, filter options, preview cards, tab labels.
- Must be scannable with clear headings and chunked content.

**LAYER 3: READ (10-30 seconds)**
- I need details to make a decision.
- Layout: Expandable sections, detail panels, secondary tabs, inline descriptions.
- Revealed by user action: click, hover (desktop only), scroll.

**LAYER 4: DEEP DIVE (30+ seconds)**
- I need comprehensive information or advanced controls.
- Layout: Full-page detail views, modal dialogs with rich content, dedicated settings pages.
- Must be accessible but not visually dominant until requested.

### 5.2 Chunking Strategies
Break complex information into digestible spatial units:

**CARD-BASED CHUNKING**
- Each card contains one concept or one action.
- Layout: Grid of equal-sized cards for browsing; list of horizontal cards for scanning.
- Cards must have consistent internal structure: image/thumbnail → title → summary → action.
- Do not mix card types in the same grid without clear visual differentiation.

**TAB-BASED CHUNKING**
- Each tab represents a parallel content category.
- Layout: Horizontal tabs above content area; vertical tabs for complex dashboards.
- Tab labels must be parallel in structure (all nouns or all verbs).
- Content within tabs should be roughly equal in complexity.

**ACCORDION CHUNKING**
- Vertical stack of expandable sections.
- Layout: Full-width headers with expand/collapse icons; content revealed below.
- Use when: Users need to access multiple sections but not simultaneously.
- Maximum 7-9 items before requiring search or filtering.

**STEP-BASED CHUNKING**
- Linear sequence of content chunks.
- Layout: Numbered steps with clear progress indication.
- Each step should fit in a single viewport if possible.
- Show summary of previous steps in a sidebar or collapsed header.

### 5.3 Above the Fold vs. Below the Fold
- **Above the fold**: Must communicate value proposition and primary action.
- **Below the fold**: Supporting detail, social proof, related content, legal info.
- Layout rule: Do not hide primary actions below the fold. Do not cram everything above the fold.
- The fold is not a hard line; users scroll when they trust the page. Trust is established by clear hierarchy above the fold.

---

## SECTION 6: GRID SYSTEMS & SPATIAL RELATIONSHIPS

### 6.1 Grid Fundamentals
A grid is the invisible framework that governs element placement.

**COLUMN GRID**
- 12-column system is standard for web.
- Layout rule: Content blocks should align to column edges, not float arbitrarily.
- Gutters (space between columns) must be consistent. 24px-32px is standard for desktop.
- Margins (space at edges) should be equal or proportional to gutters.

**MODULAR GRID**
- Combines columns with horizontal rows.
- Layout rule: Creates strict alignment for complex dashboards and data-heavy interfaces.
- Every element should snap to a module boundary.
- Prevents the "almost aligned" look that feels AI-generated.

**BASELINE GRID**
- Horizontal rhythm based on line height (typically 4px, 8px, or 16px increments).
- Layout rule: All vertical spacing (margins, padding, component heights) should be multiples of the base unit.
- This creates subconscious rhythm that feels intentional.

### 6.2 Responsive Layout Breakpoints
Layout must transform at defined viewport widths:

**MOBILE (< 768px)**
- Single column layout.
- Stacked content; no side-by-side except for small inline elements.
- Navigation collapses to hamburger or bottom tabs.
- Touch targets minimum 44x44px (spatial requirement, not visual).
- Content reflows; horizontal scrolling is forbidden except for carousels.

**TABLET (768px - 1024px)**
- 2-column layout possible.
- Sidebar can persist if narrow; otherwise collapses.
- Touch targets remain large.
- More whitespace acceptable due to larger screen.

**DESKTOP (> 1024px)**
- Multi-column layouts.
- Persistent sidebars for navigation and filters.
- Hover states become viable (but never required for core functionality).
- Maximum content width should be constrained (1200px-1440px) to prevent line lengths that are too long for reading.

### 6.3 Whitespace as a Layout Tool
- **Macro whitespace**: Space between major sections. Creates breathing room and section separation.
- **Micro whitespace**: Space between lines, letters, and inline elements. Affects readability.
- **Active whitespace**: Intentional empty space that guides the eye to important elements.
- **Passive whitespace**: Natural space created by element boundaries.
- Layout rule: AI-generated layouts often lack macro whitespace. They feel dense and flat. Increase space between unrelated sections by 2x what feels "safe."

### 6.4 Alignment Rules
- **Left alignment**: Standard for text in Western languages. Creates a strong vertical edge that guides the eye.
- **Right alignment**: Use for numbers in tables, timestamps in logs.
- **Center alignment**: Use sparingly. Only for short phrases, buttons in narrow containers, or hero sections.
- **Justified text**: Avoid on web. Creates uneven word spacing.
- **Edge alignment**: All elements should align to a grid line. Nothing should be "almost" aligned.

---

## SECTION 7: ANTI-AI-GENERATED LAYOUT PATTERNS

### 7.1 What Makes Layouts Feel AI-Generated
AI tools default to:
1. Perfect symmetry and equal distribution
2. Generic 3-column feature grids
3. Hero image + 3 cards + CTA footer
4. Center-aligned everything
5. No variation in content density
6. Missing progressive disclosure
7. No clear primary action per section
8. Navigation that mirrors template defaults
9. Content that ignores real-world variance (all images same aspect ratio, all text same length)
10. Lack of contextual entry points

### 7.2 Human Layout Patterns

**ASYMMETRICAL BALANCE**
- Visual weight is balanced, but elements are not mirrored.
- Layout: Large content block on left, smaller but high-contrast action block on right.
- Creates dynamic tension and visual interest without sacrificing usability.

**VARIABLE DENSITY**
- Some areas are information-dense; others are sparse.
- Layout: A dashboard with a large sparse chart next to a dense data table.
- AI tends to equalize density. Humans vary it based on importance.

**CONTEXTUAL NAVIGATION**
- Navigation changes based on user state, role, or context.
- Layout: Admin users see a "Moderation" link; regular users do not.
- AI generates one-size-fits-all navigation.

**BROKEN GRID MOMENTS**
- Intentional misalignment for emphasis.
- Layout: A testimonial quote that bleeds into the margin, or an image that overlaps two sections.
- Must be used sparingly (1-2 per page) and always serve a content purpose.

**REAL-WORLD CONTENT VARIANCE**
- Layouts must account for:
  - Headlines that range from 20 to 200 characters
  - Images with different aspect ratios
  - Data tables with variable row counts
  - User-generated content of unpredictable length
- AI layouts often assume perfect content. Human layouts plan for imperfection.

### 7.3 Task-Flow Based Layout
Instead of organizing by content type, organize by user task:

**TASK: "I need to find a specific document"**
- Layout: Prominent search bar → filter sidebar → sortable list with preview panes → detail panel.
- Not: Category browsing → subcategory → grid of icons → click to see if relevant.

**TASK: "I need to compare products"**
- Layout: Side-by-side comparison table, sticky header with product names, scrollable feature rows.
- Not: Individual product cards that must be opened in separate tabs.

**TASK: "I need to monitor system status"**
- Layout: Alert banner at top → critical metrics in large tiles → secondary charts in smaller tiles → log stream at bottom.
- Not: Equal-sized widgets with no priority differentiation.

### 7.4 The Component Audit Method
To ensure layouts feel authentic:
1. Screenshot 5 interfaces you admire.
2. Draw wireframes over them, noting ONLY spatial decisions: where is the nav? How big is the hero? Where do related items go? What is the whitespace ratio?
3. Identify 3 spatial techniques that differ from template defaults.
4. Apply one technique to your current project.

---

## SECTION 8: USER-CENTERED LAYOUT VALIDATION

### 8.1 Research Methods for Layout Testing

**CARD SORTING**
- Users organize content cards into groups that make sense to them.
- Output: The user's mental model of information hierarchy.
- Use this to determine: Main navigation categories, sidebar groupings, footer organization.

**TREE TESTING**
- Users navigate a text-only hierarchy to find specific items.
- Output: Whether your information architecture matches user expectations.
- Use this to validate: Navigation labels, category nesting depth, path length to content.

**FIRST-CLICK TESTING**
- Users are shown a task and a screenshot, then click where they would go first.
- Output: Whether your layout's visual hierarchy matches user task priorities.
- Use this to validate: CTA placement, nav prominence, search visibility.

**EYE-TRACKING**
- Hardware tracks where users look on a screen.
- Output: Heatmaps of attention.
- Use this to validate: Whether primary content receives primary attention, whether secondary content is discoverable.

**THINK-ALOUD USABILITY TESTING**
- Users verbalize their thoughts while completing tasks.
- Output: Qualitative insights into layout confusion.
- Use this to validate: Whether users understand grouping, whether navigation is findable, whether progressive disclosure is discoverable.

### 8.2 Layout Heuristics (Expert Review)
Evaluate layouts against these criteria without users:

**H1: VISIBILITY OF SYSTEM STATUS**
- Does the layout show the user where they are? (Breadcrumbs, page titles, active nav states)
- Does the layout show progress? (Progress bars, step indicators, loading states)

**H2: MATCH BETWEEN SYSTEM AND REAL WORLD**
- Does the layout follow conventions the user knows? (Search top-right, logo top-left, cancel bottom-right in dialogs)
- Does the layout use the user's language in labels and headings?

**H3: USER CONTROL AND FREEDOM**
- Does the layout provide clear exit points? (Cancel buttons, breadcrumbs, global nav)
- Does the layout support undo/redo spatially? (Undo buttons near action areas)

**H4: CONSISTENCY AND STANDARDS**
- Are similar elements in similar places across all pages?
- Does the navigation remain in the same location?
- Do buttons of the same priority have the same spatial treatment?

**H5: ERROR PREVENTION**
- Does the layout separate destructive actions from common actions?
- Are confirmation steps spatially separated from routine actions?

**H6: RECOGNITION RATHER THAN RECALL**
- Does the layout show options rather than requiring memory?
- Are navigation options visible, not hidden behind gestures or hover?

**H7: FLEXIBILITY AND EFFICIENCY**
- Does the layout support both novice and expert users? (Keyboard shortcuts visible, advanced options collapsed but accessible)
- Can frequent users create shortcuts or customize layout?

**H8: AESTHETIC AND MINIMALIST DESIGN**
- Does the layout contain only relevant information?
- Is every element justified by a user need or content relationship?

**H9: HELP USERS RECOGNIZE AND RECOVER FROM ERRORS**
- Are error messages placed near the error source?
- Is help content accessible from every page layout?

**H10: HELP AND DOCUMENTATION**
- Is help accessible without leaving the current task?
- Are tooltips, hints, or inline help part of the layout?

---

## SECTION 9: DOCUMENTATION STANDARDS FOR AI CONSUMPTION

### 9.1 How to Read This Document
This document uses a hierarchical structure optimized for AI parsing:
- **Sections** are major topics.
- **Subsections** are specific principles or methods.
- **Bullet points** are actionable rules.
- **Examples** are concrete layout scenarios.
- **All spatial decisions are explicit** (placement, size, order, grouping).

### 9.2 Layout Specification Format
When specifying a layout, use this structure:

```
PAGE: [Page Name]
PRIMARY TASK: [What the user is trying to do]
ENTRY POINTS: [How users arrive here]

ZONE 1 (Primary Focus):
  - Content: [What goes here]
  - Placement: [Screen position]
  - Dimensions: [Relative size]
  - Action: [Primary CTA]

ZONE 2 (Secondary Support):
  - Content: [What goes here]
  - Placement: [Screen position]
  - Relationship to Zone 1: [Spatial connection]

ZONE 3 (Tertiary/Utility):
  - Content: [What goes here]
  - Placement: [Screen position]
  - Access method: [Always visible / Collapsed / Hover]

NAVIGATION:
  - Global: [Placement and content]
  - Local: [Placement and content]
  - Associative: [Placement and content]

RESPONSIVE TRANSFORMATION:
  - Mobile: [How layout changes]
  - Tablet: [How layout changes]
  - Desktop: [How layout changes]

ANTI-PATTERNS TO AVOID:
  - [Specific layout mistakes]
```

### 9.3 Key Terms Glossary
- **IA**: Information Architecture — how content is organized and labeled.
- **Progressive Disclosure**: Revealing information in layers based on user need.
- **Mental Model**: The user's internal understanding of how a system works.
- **Entry Point**: Any page through which a user first enters the system.
- **CTA**: Call To Action — the primary button or link for a task.
- **Whitespce**: Empty space used as a design tool for grouping and emphasis.
- **Fold**: The bottom edge of the initial viewport before scrolling.
- **Grid**: The underlying structure that aligns layout elements.
- **Chunking**: Breaking information into digestible spatial units.
- **Heuristic**: A rule of thumb for expert evaluation.

---

## SECTION 10: CHECKLIST & QUICK REFERENCE

### 10.1 Layout Design Checklist

**INFORMATION ARCHITECTURE**
- [ ] All 8 Dan Brown principles are addressed
- [ ] Content inventory is complete
- [ ] Organizational system is chosen (hierarchical / sequential / matrix)
- [ ] Multiple classification paths exist for key content
- [ ] Navigation is consistent across all pages
- [ ] Every page is a valid front door

**SPATIAL HIERARCHY**
- [ ] Each page has ONE primary action
- [ ] F-pattern or Z-pattern is respected for content type
- [ ] Gestalt principles (proximity, similarity, continuity) are applied
- [ ] Content is chunked into digestible units
- [ ] Progressive disclosure layers are defined (Glance → Scan → Read → Deep Dive)

**GRID & ALIGNMENT**
- [ ] Grid system is defined (columns, gutters, margins)
- [ ] Baseline grid is established (4px/8px/16px increments)
- [ ] All elements align to grid lines
- [ ] Whitespace is intentional (macro and micro)
- [ ] Responsive breakpoints are defined
- [ ] Maximum content width is constrained on large screens

**ANTI-AI PATTERNS**
- [ ] Layout is not perfectly symmetrical
- [ ] Content density varies based on importance
- [ ] Navigation is contextual, not generic
- [ ] Real-world content variance is accommodated
- [ ] Task flow drives layout, not template default
- [ ] At least one "broken grid" moment serves content purpose

**VALIDATION**
- [ ] Card sorting validates information grouping
- [ ] Tree testing validates navigation labels
- [ ] First-click testing validates visual hierarchy
- [ ] Heuristic evaluation passes all 10 criteria
- [ ] Think-aloud testing confirms layout understanding

### 10.2 Common Layout Mistakes

**MISTAKE 1: The Generic Hero**
- Full-width image + centered headline + 3 feature cards below.
- Fix: Vary the layout based on task. Use asymmetric splits, side-by-side content, or direct task entry.

**MISTAKE 2: Equal-Weight Navigation**
- All nav items have the same visual prominence.
- Fix: Use size, position, and grouping to show hierarchy. Primary items left/top; utilities right/corner.

**MISTAKE 3: The Infinite Scroll Trap**
- No pagination, no filtering, no search within list.
- Fix: Provide sticky filters, search within results, and clear "end of list" indicators.

**MISTAKE 4: Sidebar Overload**
- Sidebar contains main nav, filters, ads, related links, and social widgets.
- Fix: Separate concerns. Main nav in top bar. Filters in dedicated sidebar. Related content at bottom.

**MISTAKE 5: Modal Abuse**
- Important content hidden in modals that block the main task.
- Fix: Use detail panels, expandable sections, or dedicated pages. Reserve modals for confirmations and alerts.

**MISTAKE 6: Mobile Afterthought**
- Desktop layout simply squeezed to mobile width.
- Fix: Design mobile layout first. Determine content priority, then expand to desktop.

**MISTAKE 7: Missing Empty States**
- No layout defined for when content is absent.
- Fix: Design empty state layouts with guidance, examples, and clear next steps.

**MISTAKE 8: Ignoring Error States**
- Error messages break layout or appear as generic banners.
- Fix: Embed error messages near the source. Preserve layout structure during loading and error states.

### 10.3 Layout Decision Tree

```
START: What is the user's primary task?

IF finding specific content:
  → Prominent search
  → Filter sidebar
  → Sortable list with previews
  → Detail panel or page

IF browsing/discovering:
  → Category navigation
  → Exemplar previews
  → Card grid with progressive loading
  → Related content pathways

IF completing a multi-step task:
  → Step indicator
  → Single-column form layout
  → Sticky summary sidebar
  → Clear Next/Back/Exit controls

IF monitoring/status checking:
  → Alert banner (top)
  → Critical metrics (large tiles)
  → Secondary charts (smaller tiles)
  → Log/history stream (bottom)

IF creating/editing content:
  → Primary canvas (center, large)
  → Tool palette (left or top)
  → Properties panel (right)
  → Action bar (bottom or top)
```

---

## APPENDIX A: REAL-WORLD LAYOUT EXAMPLES (Spatial Analysis)

### A.1 E-Commerce Product Page
```
PRIMARY TASK: Evaluate and purchase product

ZONE 1 (Left 60%):
  - Image gallery (vertical thumbnails left, main image center)
  - Thumbnails allow direct image selection
  - Main image supports zoom on hover (desktop) / tap (mobile)

ZONE 2 (Right 40%):
  - Product title (H1, top)
  - Price and availability (below title, prominent)
  - Variant selectors (size, color) — horizontal button groups
  - Quantity selector + Add to Cart (primary CTA, full width)
  - Shipping info (collapsed accordion below CTA)
  - Key specs (3-4 bullet points, scannable)

ZONE 3 (Below fold, full width):
  - Detailed description (left 60%)
  - Specifications table (right 40%)
  - Reviews summary + detailed reviews (full width, tabbed or stacked)
  - Related products (horizontal scroll or grid, bottom)

NAVIGATION:
  - Global header: Logo, search, account, cart
  - Breadcrumbs: Home > Category > Subcategory > Product
  - Local: "Back to [Category]" link

RESPONSIVE:
  - Mobile: Image gallery becomes swipeable carousel. Product info stacks below.
  - Tablet: 50/50 split or stacked depending on orientation.
```

### A.2 Dashboard / Analytics Platform
```
PRIMARY TASK: Monitor system health and identify anomalies

ZONE 1 (Top, full width):
  - Alert banner (only when critical alerts exist)
  - Date range selector and global filters

ZONE 2 (Below alert, 3-column grid):
  - KPI cards: Large number + trend indicator + sparkline
  - 3-4 cards visible without scroll
  - Cards ordered by business priority, not alphabetically

ZONE 3 (Below KPIs, 2-column split):
  - Left (60%): Main chart or data table
  - Right (40%): Secondary chart or activity feed

ZONE 4 (Bottom, full width):
  - Detailed data table with pagination
  - Sticky header on scroll
  - Inline actions (edit, view details) per row

NAVIGATION:
  - Left sidebar: Persistent, collapsible on mobile
  - Top bar: Global search, notifications, user menu
  - Breadcrumbs: Dashboard > Section > Subsection

RESPONSIVE:
  - Mobile: Sidebar becomes hamburger. KPIs stack vertically. Charts become swipeable tabs.
  - Tablet: 2-column KPI grid. Sidebar narrows to icons only.
```

### A.3 Documentation / Knowledge Base
```
PRIMARY TASK: Find and understand technical information

ZONE 1 (Left 20%, persistent):
  - Search bar (top of sidebar)
  - Table of contents, expandable tree structure
  - Current page highlighted in tree
  - "On this page" mini-TOC for current article

ZONE 2 (Center 60%):
  - Article title and metadata (last updated, reading time)
  - Content body with clear heading hierarchy (H2, H3)
  - Code blocks with copy buttons
  - Callout boxes for warnings, tips, notes
  - "Was this helpful?" feedback at bottom

ZONE 3 (Right 20%, optional):
  - Related articles
  - Page rating or tags
  - "Edit this page" link (for open-source docs)

NAVIGATION:
  - Global: Logo, version selector, language switcher
  - Local: Previous/Next article links at bottom
  - Associative: "Related" sidebar, "See also" inline links

RESPONSIVE:
  - Mobile: Sidebar collapses to hamburger. Right sidebar moves to bottom or becomes tabs.
  - Tablet: Sidebar narrows. Right sidebar may hide.
```

### A.4 Form / Wizard Interface
```
PRIMARY TASK: Complete a complex data entry task

ZONE 1 (Top, full width):
  - Step indicator: Numbered steps with titles
  - Current step highlighted, future steps grayed, past steps checkmarked
  - Progress bar optional for linear tasks

ZONE 2 (Center, single column, max-width 600px):
  - Step title (H2)
  - Form fields grouped by logic:
    - Personal info group (name, email, phone)
    - Address group (street, city, zip, country)
    - Preferences group (checkboxes, radios)
  - Each group separated by whitespace or subtle divider
  - Primary action button (Next / Submit) at bottom of form
  - Secondary action (Save for later, Skip) as text link below primary

ZONE 3 (Bottom or sticky footer):
  - Summary of completed steps (collapsible)
  - Cancel / Exit button (left aligned, less prominent)

NAVIGATION:
  - Step indicator serves as primary nav
  - Users can click past steps to edit (if data is saved)
  - Global nav hidden or minimized to reduce distraction

RESPONSIVE:
  - Mobile: Step indicator becomes simple "Step X of Y" text. Form fields stack.
  - Tablet: Same as desktop, more whitespace.
```

---

## APPENDIX B: LAYOUT PRINCIPLES FOR SPECIFIC CONTENT TYPES

### B.1 Data Tables
- **Density**: Use comfortable row height (48px minimum for desktop, 56px for touch).
- **Alignment**: Text left-aligned, numbers right-aligned, actions center or right.
- **Sorting**: Column headers must be clickable for sort. Show sort indicator.
- **Pagination**: Place below table. Show item count. Allow rows-per-page selection.
- **Horizontal scroll**: Avoid if possible. If unavoidable, freeze first column.
- **Empty state**: Show "No data" message with icon and action to add data.

### B.2 Forms
- **Label placement**: Above the input (fastest scanning) or left-aligned (for dense forms).
- **Group related fields**: Personal info, address, payment — each in a visual group.
- **Tab order**: Must follow visual layout (top-to-bottom, left-to-right).
- **Error placement**: Inline, below input, in red (or other non-color indicator).
- **Help text**: Below label or input, smaller size, gray.
- **Primary action**: Bottom of form, full width on mobile, auto-width on desktop.

### B.3 Search Results
- **Query display**: Show the search query prominently. Allow easy editing.
- **Filter placement**: Left sidebar on desktop; horizontal scroll or collapsible panel on mobile.
- **Result format**: Title (link), URL/breadcrumb, snippet, metadata (date, author, type).
- **Pagination vs. Infinite scroll**: Use pagination for goal-directed search; infinite scroll for browsing.
- **No results**: Suggest alternatives, show popular searches, check spelling.

### B.4 Chat / Messaging Interfaces
- **Message alignment**: Incoming left, outgoing right (or stacked with clear sender labels).
- **Timestamp**: Show relative time ("2 min ago") with absolute on hover.
- **Input area**: Fixed at bottom, multi-line expandable, send button right.
- **Context**: Show conversation header with participant info and actions.
- **New message indicator**: Unread badge or divider line.

### B.5 Maps / Spatial Data
- **Primary map**: Occupies 60-80% of viewport.
- **Overlay panels**: Slide-in sidebars for details, filters, or lists.
- **Controls**: Zoom, layers, search — grouped in one corner, not scattered.
- **Legend**: Collapsible, contextual to current view.
- **Mobile**: Map full screen; details in bottom sheet that slides up.

---

## APPENDIX C: ACCESSIBILITY LAYOUT REQUIREMENTS

### C.1 Screen Reader Layout
- **DOM order must match visual order.** If it looks left-to-right, the HTML must read left-to-right.
- **Skip links**: "Skip to main content" link must be first focusable element.
- **Landmarks**: Use `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>` to create a navigable structure.
- **Heading hierarchy**: One H1 per page, followed by H2, H3 in logical order. Do not skip levels for visual size.

### C.2 Keyboard Navigation Layout
- **Focus order**: Must follow a logical path through the layout.
- **Focus indicators**: Must be visible. Do not remove outlines without replacement.
- **Tab traps**: Avoid layouts where keyboard users get stuck in a subsection.
- **Modal focus**: When modal opens, focus must move to modal. When closed, focus must return to trigger.

### C.3 Cognitive Accessibility
- **Consistent placement**: Navigation, search, and login must be in the same place on every page.
- **Predictable patterns**: Similar layouts for similar content types.
- **Reduced motion**: Layout must not require animation to convey information.
- **Error prevention**: Destructive actions must be spatially separated from common actions.

---

## APPENDIX D: TOOLS AND RESOURCES

### D.1 Layout Design Tools
- **Figma / FigJam**: For wireframing, sitemaps, and collaborative layout design.
- **Miro**: For card sorting, journey mapping, and IA workshops.
- **Whimsical**: For flowcharts, wireframes, and sitemaps.
- **Optimal Workshop**: For card sorting, tree testing, and first-click testing.

### D.2 Validation Tools
- **Browser DevTools**: For testing responsive breakpoints, grid alignment, and DOM order.
- **Lighthouse**: For accessibility and performance audits.
- **WAVE**: For accessibility error detection.
- **Hotjar / FullStory**: For heatmaps and session recordings.

### D.3 Reference Documentation
- "The Elements of User Experience" by Jesse James Garrett
- "Information Architecture for the World Wide Web" by Louis Rosenfeld and Peter Morville
- "Don't Make Me Think" by Steve Krug
- "The Design of Everyday Things" by Don Norman
- Baymard Institute UX Research (baymard.com)
- Nielsen Norman Group Articles (nngroup.com)

---

## DOCUMENT METADATA
- **Purpose**: Layout-first UX/UI design reference for building human-centered, non-AI-generated interfaces.
- **Scope**: Information architecture, spatial hierarchy, navigation, grid systems, responsive design, validation methods.
- **Exclusions**: Visual design (color, typography, illustration, animation), brand identity, frontend implementation code.
- **Target Audience**: Designers, developers, product managers, AI systems consuming design requirements.
- **Structure**: Hierarchical markdown with explicit spatial rules, examples, and checklists.
- **Version**: 1.0
- **Sources**: Baymard Institute, Figma Resource Library, UX Design Institute, Nielsen Norman Group, Dan Brown's IA Principles, Medium Design Bootcamp, TheFrontKit, Dev.to design community.

---

END OF DOCUMENT
