// ============================================================
// Pazator - Main Entry Point
// ============================================================
// Module architecture:
//
// js/core/           - Foundation layer
//   globals.js       - Global state (pazatorData, tags, cases, etc.)
//   modal.js         - Modal/alert/confirm system
//   dom-refs.js      - DOM element references
//   data-utils.js    - ID generation, vector search, worker manager
//   store.js         - Event system (pazator_store)
//   worker.js        - Web Worker
//   persistence.js   - IndexedDB save/load/autoSave
//   app-init.js      - Auth check, logo dropdown setup
//   utils.js         - Utility functions
//   init.js          - Final DOMContentLoaded hooks
//
// js/data/           - Data layer
//   engine.js        - IndexedDB v2 (pazator_engine, single DB, no legacy v1)
//   facets.js        - Faceted search (pazator_facets)
//
// js/chat/           - Chat processing
//   chat-system.js   - ChatValidator, ChatParser, ChatStorageManager, ChatAnalysisService
//
// js/ai/             - AI/Zor system
//   gemini.js        - Gemini API client (pazator_gemini)
//   ai.js            - AI queue (pazator_ai)
//   agents.js        - Agent system (pazator_agents)
//   context.js       - AI context management (pazator_context)
//   zor-chat.js      - Zor chat UI, actions, conversation
//   zor-context.js   - AI context modal, data loading
//   zor-tools.js     - Zor tool-calling mode
//
// js/ui/             - UI components
//   ui.js            - Common UI utilities (PazatorUI)
//   tabs.js          - Tab navigation system
//   table.js         - Virtual data table, bulk operations
//   settings.js      - Settings, password, classification
//
// js/features/       - Feature modules
//   detail.js        - Entity detail views, slide panel, timeline, tags
//   uploads.js       - Chat/data upload, CSV import
//   visualization.js - Web node zoom/drag
//   intel.js         - AI suggestions, findings
//   chat-manager.js  - Chat listing, D3 graph, path finding, relationships
//   credits.js       - Credit scoring
//   findings.js      - Intel/terrorist/fraudster findings
//   search.js        - Universal search with facets
//   cases.js         - Case management + evidence
//   relationships.js - Relationship graph (pazator_relationships)
//   timeline.js      - Entity timeline (pazator_timeline)
//   heuristics.js    - Identity resolution (pazator_heuristics)
//
// js/tracker/        - LCTX Tracker
//   tracker.js       - MapLibre globe tracker, Supabase geolocation
//
// js/apps/           - Full application modules
//   dashboard.js     - Dashboard widgets (pazator_dashboard)
//   ontology.js      - Ontology designer (pazator_ontology_designer)
//   pipelines.js     - Pipeline builder (pazator_pipelines)
//   alerts.js        - Alert system (pazator_alerts)
//   api.js           - REST/GraphQL console (pazator_api)
//   resolver.js      - Entity resolver (pazator_resolver)
//   reports.js       - Report generator (pazator_reports)
//   workflow.js      - Visual workflow engine (pazator_workflow)
//   sync.js          - Sync server (pazator_sync)
//   gis.js           - GIS mapping (pazator_gis)
//   objects.js       - Ontology objects (pazator_objects)
//   snappy.js        - Screenshot tool (pazator_snappy)
//   walkthrough.js   - Onboarding walkthrough
// ============================================================

// Final initialization hooks
document.addEventListener('DOMContentLoaded', initSettings);
document.addEventListener('DOMContentLoaded', loadLogoForPDF);
document.addEventListener('DOMContentLoaded', function () {
    initAcFields();

});
