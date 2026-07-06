# Graph Report - deepseek-multimodal-proxy  (2026-07-06)

## Corpus Check
- 67 files · ~52,435 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 702 nodes · 895 edges · 84 communities (63 shown, 21 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `967f1b25`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

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
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]

## God Nodes (most connected - your core abstractions)
1. `scripts` - 28 edges
2. `getErrorMessage()` - 21 edges
3. `Changelog` - 20 edges
4. `MasterTestSuite` - 15 edges
5. `compilerOptions` - 15 edges
6. `Cortex Sensorial v3 — Implementation Plan` - 14 edges
7. `GeminiService` - 14 edges
8. `CLAUDE.md — DeepSeek Multimodal Proxy` - 14 edges
9. `DeepSeek Multimodal Proxy (Gemini Edition)` - 14 edges
10. `CacheService` - 13 edges

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

## Communities (84 total, 21 thin omitted)

### Community 0 - "Model Strategy & Caching"
Cohesion: 0.20
Nodes (10): DeepSeek V4 Flash Model, Gemini 2.5 Flash Model, Sensory Cortex v2 Architecture Pattern, gemini-direct Model Design, deepseek-multimodal-flash Proxy Model, SHA-256 Contextual Cache, vision-direct Proxy Model, Cache Service (+2 more)

### Community 1 - "Multimodal Detection Pipeline"
Cohesion: 0.06
Nodes (35): Full Multimodality v1.3.0, Claude Code Anthropic API Support v1.4.0, Anthropic Adapter Design, /v1/messages Anthropic Endpoint, Multimodal Detector Middleware, Multimodal Processor Middleware, Claude Code Model Mapping Table, Claude Code Integration (+27 more)

### Community 2 - "Claude Code Integration"
Cohesion: 0.07
Nodes (28): scripts, build, clean, dev, docker:build, docker:down, docker:logs, docker:ps (+20 more)

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

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (29): ContentAnalysis, DetectedContent, detectFileType(), detectMultimodalContent(), extractUserContext(), getDeepseekSupportedContent(), getLocalProcessingContent(), getVisionRequiredContent() (+21 more)

### Community 18 - "Community 18"
Cohesion: 0.07
Nodes (27): Architecture, Bugs Fixed, Cache, CI/CD, CI/CD, Claude Code / Anthropic, Code Quality, Completed (+19 more)

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (21): Architecture, Background, Brain registry (in code), Compatibility contract, Configuration, Cortex Sensorial v3 — OpenCode Go Integration, Deleted files, Edge cases (+13 more)

### Community 20 - "Community 20"
Cohesion: 0.17
Nodes (7): colors, fs, http, MasterTestSuite, path, print, TEST_FILES_DIR

### Community 21 - "Community 21"
Cohesion: 0.20
Nodes (18): axios, FILES_DIR, fs, loadBase64File(), path, runTests(), testAnthropicModels(), testAudio() (+10 more)

### Community 22 - "Community 22"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 23 - "Community 23"
Cohesion: 0.12
Nodes (15): [1.0.0] - 2026-02-06, [1.2.1] - 2026-02-09, [1.2.3] - 2026-02-09, [1.2.5] - 2026-02-09, [1.5.1] - 2026-02-12, [1.7.1] - 2026-02-13, [1.7.2] - 2026-02-25, Added (+7 more)

### Community 24 - "Community 24"
Cohesion: 0.13
Nodes (14): Architecture, CLAUDE.md — DeepSeek Multimodal Proxy, Code Quality, Compatibility, Docker, Environment, Git, Language (+6 more)

### Community 25 - "Community 25"
Cohesion: 0.05
Nodes (37): author, bugs, url, dependencies, axios, dotenv, express, @google/generative-ai (+29 more)

### Community 27 - "Community 27"
Cohesion: 0.17
Nodes (11): 🧪 Available Unit Tests, ✅ Claude Code Suite (Optional), 📊 Execution Summary (v2.0.0), 🧪 Integration Test Details, Integration Tests (Master Suite), 🧪 Run All, ⚙️ Test Environment, Test Report - DeepSeek Multimodal Proxy (+3 more)

### Community 31 - "Community 31"
Cohesion: 0.06
Nodes (39): AnthropicAdapter, BRAIN_MODELS, BrainModelEntry, getBrainEntry(), isKnownModel(), isPassthrough(), parseProxyModelId(), PASSTHROUGH_MODELS (+31 more)

### Community 33 - "Community 33"
Cohesion: 0.20
Nodes (9): Available Proxy Models, Claude Code Models (Anthropic), DeepSeek V4 Flash - Chat (Max Thinking), DeepSeek V4 Pro - Reasoner (Max Thinking), Intelligent Routing, Model Configuration, OpenCode Models (OpenAI API), Pricing (per 1M tokens, worst case combined) (+1 more)

### Community 34 - "Community 34"
Cohesion: 0.38
Nodes (8): Ensure-CacheDirectory(), Get-Health(), Get-ProxyProcessFromPort(), Get-TrackedProcess(), Show-Status(), Start-Proxy(), Stop-Proxy(), Uninstall-Proxy()

### Community 35 - "Community 35"
Cohesion: 0.22
Nodes (8): 1. Report Bugs, 2. Submit Pull Requests, Contribution Guide, 💻 Development Workflow, 🌟 How you can help, ⚖️ License, 🛠️ Project Structure, 📜 Standards and Quality

### Community 36 - "Community 36"
Cohesion: 0.22
Nodes (8): 1. `setup.sh` / `setup.ps1` - Instalador Automático, 2. `manage.sh` / `manage.ps1` - Comando Único de Gestión, 3. `run-local.sh` / `run-local.ps1` - Ejecución Rápida, 🚀 Integración con NPM, 🧪 Pruebas, Scripts de Gestión Unificados, 📋 Scripts Principales, ⚠️ Solución de Problemas

### Community 37 - "Community 37"
Cohesion: 0.25
Nodes (7): Attribution, Code of Conduct - Contributor Covenant, Enforcement, Enforcement Responsibilities, Our Pledge, Our Standards, Scope

### Community 39 - "Community 39"
Cohesion: 0.25
Nodes (7): 🚀 Quick Start, ⚙️ Required Configuration (.env), 🛡️ Strategy Validation, 📁 Structure, 🧪 Test Suite - DeepSeek Multimodal Proxy, Verified Scenarios:, 🔍 What does the Master Suite test?

### Community 40 - "Community 40"
Cohesion: 0.29
Nodes (6): 5.1 Create src/types/anthropic.ts, 5. Anthropic Types and Structures, 6.1 Create src/services/anthropicAdapter.ts, 6. Translation Adapter, Definitive Guide: Claude Code Implementation in DeepSeek Multimodal Proxy, 📋 Table of Contents

### Community 41 - "Community 41"
Cohesion: 0.29
Nodes (7): 4.1 What is gemini-direct?, 4.2 Why is it necessary?, 4.3 Configuration, 4.4 gemini-direct Routing, 4.5 New Function in geminiService.ts, 4.6 Exposition in /v1/models, 4. gemini-direct Model

### Community 42 - "Community 42"
Cohesion: 0.29
Nodes (6): `anthropicAdapter.ts`, `cacheService.ts`, `deepseekService.ts`, `geminiService.ts`, Service Descriptions, System Services

### Community 43 - "Community 43"
Cohesion: 0.33
Nodes (6): 1.1 Overview, 1.2 Current Endpoints (OpenAI-compatible), 1.3 Currently Exposed Models, 1.4 Current File Structure, 1.5 Current Configuration (.env), 1. Current Proxy State

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (6): 8. Step-by-Step Implementation, Phase 1: Types and gemini-direct Model, Phase 2: Translation Adapter, Phase 3: Anthropic Endpoints, Phase 4: Manual Testing with Claude Code, Phase 5: Automated Testing

### Community 45 - "Community 45"
Cohesion: 0.33
Nodes (6): Added Endpoints, Claude Code Configuration, Compatibility, ✅ Final Summary, Modifications, New Components

### Community 46 - "Community 46"
Cohesion: 0.33
Nodes (5): Data Flow, Functionality, Middleware, `multimodalDetector.ts`, `multimodalProcessor.ts`

### Community 47 - "Community 47"
Cohesion: 0.33
Nodes (5): { join }, process, projectRoot, result, { spawnSync }

### Community 48 - "Community 48"
Cohesion: 0.33
Nodes (5): { join }, process, projectRoot, result, { spawnSync }

### Community 49 - "Community 49"
Cohesion: 0.23
Nodes (4): GeminiService, generateContextualHash(), generateHash(), generateHashFromString()

### Community 50 - "Community 50"
Cohesion: 0.33
Nodes (5): { join }, process, projectRoot, result, { spawnSync }

### Community 51 - "Community 51"
Cohesion: 0.33
Nodes (5): `error.ts`, `hashGenerator.ts`, `imageProcessor.ts`, `logger.ts`, Utilidades del Sistema

### Community 52 - "Community 52"
Cohesion: 0.40
Nodes (5): [1.3.0] - 2026-02-10, Added, Changed, Documentation, Fixed

### Community 53 - "Community 53"
Cohesion: 0.40
Nodes (5): [1.7.0] - 2026-02-14, Added, Changed, Fixed, Removed

### Community 54 - "Community 54"
Cohesion: 0.70
Nodes (4): setup.sh script, log_error(), log_info(), log_warn()

### Community 55 - "Community 55"
Cohesion: 0.40
Nodes (5): 2.1 Current Request Flow (OpenCode → OpenAI API), 2.2 Sensory Cortex - Intelligent Routing, 2.3 Contextual Cache System, 2.4 Current OpenAI Types, 2. Existing Architecture

### Community 57 - "Community 57"
Cohesion: 0.40
Nodes (5): 3.1 Main Goal, 3.2 Models Claude Code Will Expect, 3.3 New Endpoints Required, 3.4 Absolute Compatibility, 3. Implementation Objective

### Community 58 - "Community 58"
Cohesion: 0.40
Nodes (4): Checklist:, ¿Cómo se ha probado esto?, Descripción, Tipo de cambio

### Community 59 - "Community 59"
Cohesion: 0.50
Nodes (4): [1.1.0] - 2026-02-07, Added, Changed, Fixed

### Community 60 - "Community 60"
Cohesion: 0.50
Nodes (4): [1.1.1] - 2026-02-08, Changed, Fixed, Technical

### Community 61 - "Community 61"
Cohesion: 0.50
Nodes (4): [1.4.0] - 2026-02-11, Added, Changed, Fixed

### Community 62 - "Community 62"
Cohesion: 0.50
Nodes (4): [1.5.0] - 2026-02-11, Added, Changed, Fixed

### Community 63 - "Community 63"
Cohesion: 0.50
Nodes (4): [1.6.0] - 2026-02-13, Added, Changed, Fixed

### Community 64 - "Community 64"
Cohesion: 0.50
Nodes (4): [1.8.0] - 2026-04-12, Added, Changed, Fixed

### Community 65 - "Community 65"
Cohesion: 0.50
Nodes (4): 10.1 Request: Anthropic → OpenAI, 10.2 Response: OpenAI → Anthropic, 10.3 Streaming: OpenAI SSE → Anthropic SSE, 10. Transformation Examples

### Community 66 - "Community 66"
Cohesion: 0.50
Nodes (4): 9.1 Verification Checklist, 9.2 Expected Logs, 9.3 Troubleshooting, 9. Testing and Verification

### Community 67 - "Community 67"
Cohesion: 0.50
Nodes (3): Reporting a Vulnerability, Security Policy, Supported Versions

### Community 68 - "Community 68"
Cohesion: 0.67
Nodes (3): [1.2.2] - 2026-02-09, Added, Changed

### Community 69 - "Community 69"
Cohesion: 0.67
Nodes (3): [1.3.1] - 2026-02-10, Added, Fixed

### Community 71 - "Community 71"
Cohesion: 0.67
Nodes (3): 7.1 Modify src/index.ts - Add Anthropic Endpoints, 7.2 Modify processMultimodalContent to Support gemini-direct, 7. Endpoints and Handlers

### Community 85 - "Community 85"
Cohesion: 0.13
Nodes (14): Cortex Sensorial v3 — Implementation Plan, Task 10: Rename Project, Task 11: Update Documentation, Task 12: Update Integration Tests, Task 13: Final Verification, Task 1: Brain Registry, Task 2: MiMo Senses Service, Task 3: OpenCode Go Service (+6 more)

## Knowledge Gaps
- **376 isolated node(s):** `app`, `PORT`, `DEDUPE_TTL_MS`, `HAIKU_DEFER_MS`, `inFlightAnthropic` (+371 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `scripts` connect `Claude Code Integration` to `Community 25`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `getErrorMessage()` connect `Community 17` to `Community 56`, `Community 30`, `Community 31`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `app`, `PORT`, `DEDUPE_TTL_MS` to the rest of the system?**
  _383 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Multimodal Detection Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._
- **Should `Claude Code Integration` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Community 17` be split into smaller, more focused modules?**
  _Cohesion score 0.09125188536953242 - nodes in this community are weakly interconnected._
- **Should `Community 18` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._