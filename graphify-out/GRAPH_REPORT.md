# Graph Report - .  (2026-06-09)

## Corpus Check
- Corpus is ~44,653 words - fits in a single context window. You may not need a graph.

## Summary
- 99 nodes · 45 edges · 57 communities (8 shown, 49 thin omitted)
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Model Strategy & Caching|Model Strategy & Caching]]
- [[_COMMUNITY_Multimodal Detection Pipeline|Multimodal Detection Pipeline]]
- [[_COMMUNITY_Claude Code Integration|Claude Code Integration]]
- [[_COMMUNITY_Testing & CI Pipeline|Testing & CI Pipeline]]
- [[_COMMUNITY_Detector Implementation & Tests|Detector Implementation & Tests]]
- [[_COMMUNITY_Docker Deployment|Docker Deployment]]
- [[_COMMUNITY_v1.8.0 Release|v1.8.0 Release]]
- [[_COMMUNITY_Code Quality Standards|Code Quality Standards]]
- [[_COMMUNITY_DeepSeek V4 Pro|DeepSeek V4 Pro]]
- [[_COMMUNITY_DeepSeek Service Config|DeepSeek Service Config]]
- [[_COMMUNITY_Logging (Winston)|Logging (Winston)]]
- [[_COMMUNITY_Roadmap Targets|Roadmap Targets]]
- [[_COMMUNITY_Integration Test Suite|Integration Test Suite]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]

## God Nodes (most connected - your core abstractions)
1. `Content Routing Matrix` - 4 edges
2. `103 Unit Tests with Vitest` - 4 edges
3. `Gemini 2.5 Flash Model` - 3 edges
4. `Hybrid PDF Processing` - 3 edges
5. `SHA-256 Contextual Cache` - 3 edges
6. `8 Content Type Detection` - 3 edges
7. `Docker Compose Container Service` - 3 edges
8. `Multimodal Detector Middleware` - 3 edges
9. `Anthropic Adapter Service` - 3 edges
10. `test/files/image.png — Test Image Asset` - 3 edges

## Surprising Connections (you probably didn't know these)
- `Clean Architecture Standard for Contributions` --semantically_similar_to--> `No Dead Code Rule`  [INFERRED] [semantically similar]
  CONTRIBUTING.md → CLAUDE.md
- `detectMultimodalContent` --references--> `test/files/image.png — Test Image Asset`  [INFERRED]
  tests/unit/middleware/multimodalDetector.test.ts → test/files/image.png
- `getDeepseekSupportedContent` --references--> `test/files/image.png — Test Image Asset`  [INFERRED]
  tests/unit/middleware/multimodalDetector.test.ts → test/files/image.png
- `Hybrid PDF Processing` --references--> `Large Test PDF for Routing`  [EXTRACTED]
  README.md → test/files/large-test.pdf
- `Hybrid PDF Processing` --references--> `Small Test PDF for Routing`  [EXTRACTED]
  README.md → test/files/small-test.pdf

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Sensory Cortex v2 Pattern Components** — claude_sensory_cortex_v2, claude_deepseek_v4_flash, claude_gemini_2_5_flash, services_readme_deepseek_service, services_readme_gemini_service [INFERRED 0.85]
- **Multimodal Request Pipeline** — middleware_readme_multimodal_detector, middleware_readme_multimodal_processor, services_readme_gemini_service, services_readme_deepseek_service, readme_hybrid_pdf_processing [EXTRACTED 1.00]

## Communities (57 total, 49 thin omitted)

### Community 0 - "Model Strategy & Caching"
Cohesion: 0.20
Nodes (10): DeepSeek V4 Flash Model, Gemini 2.5 Flash Model, Sensory Cortex v2 Architecture Pattern, gemini-direct Model Design, deepseek-multimodal-flash Proxy Model, SHA-256 Contextual Cache, vision-direct Proxy Model, Cache Service (+2 more)

### Community 1 - "Multimodal Detection Pipeline"
Cohesion: 0.25
Nodes (9): Full Multimodality v1.3.0, Multimodal Detector Middleware, Multimodal Processor Middleware, 8 Content Type Detection, Hybrid PDF Processing, Content Routing Matrix, Large Test PDF for Routing, Small Test PDF for Routing (+1 more)

### Community 2 - "Claude Code Integration"
Cohesion: 0.33
Nodes (6): Claude Code Anthropic API Support v1.4.0, Anthropic Adapter Design, /v1/messages Anthropic Endpoint, Claude Code Model Mapping Table, Claude Code Integration Config, Anthropic Adapter Service

### Community 3 - "Testing & CI Pipeline"
Cohesion: 0.50
Nodes (5): Vitest Unit Tests v1.6.0, 63.82% Statement Coverage, 103 Unit Tests with Vitest, CI/CD Pipeline GitHub Actions, PR Validation GitHub Actions

### Community 4 - "Detector Implementation & Tests"
Cohesion: 0.50
Nodes (5): multimodalDetector Module, test/files/image.png — Test Image Asset, Scientist & Guinea Pig in Hamster Wheel — Research/Experimentation Metaphor, detectMultimodalContent, getDeepseekSupportedContent

### Community 5 - "Docker Deployment"
Cohesion: 0.50
Nodes (4): Docker Compose Container Service, Docker Healthcheck Endpoint, Docker Cache Volume, Graceful Shutdown for Docker

### Community 6 - "v1.8.0 Release"
Cohesion: 0.67
Nodes (3): Native Windows and Docker Support v1.8.0, Docker Deployment v1.8.0, Native Windows Support v1.8.0

### Community 7 - "Code Quality Standards"
Cohesion: 0.67
Nodes (3): No Dead Code Rule, Clean Architecture Standard for Contributions, Zod Schema Validation

## Knowledge Gaps
- **69 isolated node(s):** `DetectedContent`, `ContentAnalysis`, `detectMultimodalContent`, `extractUserContext`, `getDeepseekSupportedContent` (+64 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **49 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `DetectedContent`, `ContentAnalysis`, `detectMultimodalContent` to the rest of the system?**
  _76 weakly-connected nodes found - possible documentation gaps or missing edges._