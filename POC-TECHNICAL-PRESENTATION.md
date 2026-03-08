# POC Technical Presentation
## Agentic AI Data Model System - Pure Tech

**Stack:** Node.js 18+ | LangGraph | LangChain | Azure OpenAI (GPT-4o) | Zod  
**Status:** Production POC

---

## 1. Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 18+ (ES Modules) |
| **Agent Framework** | @langchain/langgraph ^1.1.2 |
| **LLM Integration** | @langchain/openai ^1.2.4, @langchain/core ^1.1.18 |
| **LLM Provider** | Azure OpenAI (GPT-4o) |
| **Validation** | Zod ^4.3.6 |
| **Server** | Express 4.18 |
| **Parsing** | xlsx (SheetJS), csv-parse 5.5 |
| **Schema** | @dbml/core 5.4, @dbml/cli 2.5 |
| **Logging** | Pino 8.16 |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Phase-1 (Ingestion + Logical)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ upload.js   │  │ parsers/    │  │ metadataEnhancement  │ │
│  │ multer      │→ │ excelParser │→ │ Agent (LangGraph)    │ │
│  └─────────────┘  │ csv-parser  │  └──────────┬──────────┘ │
│                   └─────────────┘             │             │
│  ┌─────────────┐  ┌─────────────┐             │             │
│  │ heuristics │  │ dbmlGenerator│←────────────┘             │
│  │ pkFkInfer  │→ │ LLMLogical   │                           │
│  └─────────────┘  │ Enhancer    │                           │
│                   └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase-2 (Physical + Q&A)                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ loadMetadata│  │ MySQLGen   │  │ qaAgent (LangGraph) │  │
│  │ Metadata.js │→ │ LLMPhysical │  │ metadataAnalyzer    │  │
│  └─────────────┘  │ Enhancer   │  │ buildModelContext   │  │
│                   └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  azureLangChainService.js                                    │
│  • AzureChatOpenAI                                           │
│  • callLangChainWithSchema(schema, prompt, vars, opts)       │
│  • Circuit Breaker (CLOSED/OPEN/HALF_OPEN, threshold: 5)     │
│  • Rate Limiter (50 req/min, 60s window)                     │
│  • StructuredOutputParser.fromZodSchema(schema)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Core Components

### 3.1 Metadata Enhancement Agent (LangGraph)

**File:** `Phase-1/src/agents/metadataEnhancementAgent.js`

```javascript
// State Schema (Annotation.Root)
agentStateSchema = {
  metadata: [],           // Input columns
  enhancedMetadata: null,  // Output
  batches: [],
  processedBatches: [],
  qualityScore: 0,
  retryCount: 0,
  shouldRetry: false,
  errors: [],
  relationships: null,
  optimizations: null
}

// Workflow Graph
initialize → applyPatternMemory → prepareBatches → enhance
    → calculateQuality → [routeDecision]
         ├─ retry → [routeAfterRetry] → enhance | merge
         └─ continue → merge → inferRelationships → optimizeSchema → END
```

**Nodes:**
- `initialize`: Check Azure, load config
- `applyPatternMemory`: Load `pattern-memory.json`, apply learned patterns
- `prepareBatches`: Split metadata (batchSize: 50)
- `enhance`: Parallel LLM calls (max 5 concurrent), `enhanceMetadataBatchWithLangChain`
- `calculateQuality`: `qualityScore = totalScore/totalBatches`, compare with `minConfidence` (0.7)
- `routeDecision`: `shouldRetry = qualityScore < 0.7 && retryCount < 3 && !circuitBreakerOpen`
- `merge`: `mergeEnhancements()`, `learnFromCorrection()`
- `inferRelationships`: `inferCrossTableRelationships()`, `applyInferredRelationships()`
- `optimizeSchema`: `generateOptimizationSuggestions()`, `applyOptimizations()`

---

### 3.2 Q&A Agent (LangGraph)

**File:** `Phase-2/src/agents/qaAgent.js`

```javascript
// State Schema
qaStateSchema = {
  question: "",
  context: { lineage, impact, insights, metadata },
  conversationHistory: [],
  answer: "",
  error: null,
  retryCount: 0,
  shouldRetry: false
}

// Workflow
initialize → generateAnswer → [shouldRetryDecision]
    ├─ updateMemory → END
    ├─ wait → generateAnswer (retry)
    └─ handleError → END
```

**Decision Logic:**
```javascript
if (!error) return "updateMemory";
if (isRetryableError(error) && retryCount < 3) return "wait";
return "handleError";
// isRetryable: 429, rate limit, exceeded, quota
// getRetryDelay: 429 → 60s, else exponential backoff (1s, 2s, 4s, max 30s)
```

---

### 3.3 LangChain Service

**File:** `Phase-1/src/llm/azureLangChainService.js`

```javascript
// Circuit Breaker
state: "CLOSED" | "OPEN" | "HALF_OPEN"
failureThreshold: 5
resetTimeout: 60000
// OPEN → block; HALF_OPEN → 1 test; success → CLOSED

// Rate Limiter
maxRequestsPerMinute: 50
windowMs: 60000
// Exceeded → return waitTime (ms)

// callLangChainWithSchema(schema, promptTemplate, variables, options)
// - checkCircuitBreaker()
// - checkRateLimit() → await if needed
// - chain: PromptTemplate → langChainClient → StructuredOutputParser.fromZodSchema
// - timeout: 30000, maxRetries: 3
// - 429/rate limit → 60s delay, retry
// - recordSuccess() / recordFailure()
```

---

### 3.4 Pattern Memory

**File:** `Phase-1/src/agents/patternMemory.js`  
**Storage:** `pattern-memory.json`

```javascript
// Structure
{
  dataTypes: { "columnName": { type, confidence, count } },
  pkPatterns: { "pattern": { confidence, count } },
  fkPatterns: { "pattern": { confidence, count } },
  relationships: [],
  optimizations: [],
  lastUpdated: ISO8601
}

// applyPatternMemory(metadata) → enhanced metadata
// learnFromCorrection(columnName, correction) → update memory
```

---

## 4. Data Flow

```
Excel/CSV
  → parseExcel/parseCSV → extractMetaDataFromExcel/CSV
  → inferPKFK (heuristics)
  → runAgenticEnhancement (metadataEnhancementAgent)
      → applyPatternMemory
      → batches (50 cols each)
      → enhanceMetadataBatchWithLangChain (per batch)
      → calculateQuality → routeDecision
      → merge → learnFromCorrection
      → inferCrossTableRelationships → applyInferredRelationships
      → generateOptimizationSuggestions → applyOptimizations
  → save metadata.json

metadata.json
  → generateDBML (LLMLogicalEnhancer) → schema.dbml
  → loadMetadata (Phase-2) → MySQLGenerator → mysql.sql
  → buildModelContext → lineage, impact, insights
  → runQaAgent (question, context, history) → answer
```

---

## 5. Config (Phase-1)

```javascript
// config/index.js
llm: {
  provider: "azure",
  metadataEnhancement: {
    batchSize: 50,
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 30000,
    minConfidence: 0.7
  }
}
azure: {
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  deploymentName: "gpt-4o",
  apiVersion: "2025-01-01-preview"
}
```

---

## 6. API & CLI

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload/ingest` | Upload file, returns fileId |
| POST | `/generate/logical/:fileId` | Generate DBML + logical model |
| POST | `/generate/:fileId` | Full generation (logical + physical) |

**CLI:**
```bash
node generate-logical.js <fileId>   # Phase-1
node generate-complete.js <fileId> # Phase-2
node cli-qa.js <fileId>            # Q&A
```

---

## 7. Artifact Layout

```
artifacts/{fileId}/
├── json/metadata.json
├── dbml/schema.dbml
├── physical/
│   ├── mysql.sql
│   ├── physical_lineage.json
│   ├── physical_impact.json
│   └── physical_graph_insights.json
└── executive/
    ├── EXECUTIVE_REPORT.html
    └── erd_INTERACTIVE.html
```

---

## 8. Key Technical Details

### Zod Schemas
- **Logical:** `entities.attributes` → `logicalType`, `description`, `businessRule`, `relationships` (cardinality, optionality)
- **Physical:** `tables.columns` → `exactType`, `nullable`, `unique`, `default`, `checkConstraint`, `autoIncrement`
- **Relationships:** `fromTable`, `fromColumn`, `toTable`, `toColumn`, `confidence`, `isMissing`

### Batch Processing
- `batchSize: 50` columns
- `MAX_CONCURRENT: 5` batches in parallel
- `Promise.all(batchGroup.map(enhanceBatch))`

### Quality Threshold
- `qualityScore = Σ(batch.overallQuality.score) / batchCount`
- `shouldRetry = qualityScore < 0.7 && retryCount < 3 && !circuitBreakerOpen`

### Retry Strategy
- **Metadata Agent:** Quality-based retry with context
- **Q&A Agent:** 429 → 60s wait, max 3 retries
- **LangChain:** Exponential backoff, 429 → 60s

---

## 9. Dependencies Summary

**Phase-1:**
- @langchain/langgraph, @langchain/core, @langchain/openai
- zod, xlsx, csv-parse, express, multer, pino
- @dbml/core, @dbml/cli

**Phase-2:**
- @langchain/langgraph, @langchain/core, @langchain/openai
- zod, pino, dotenv

---

## 10. Technical Metrics

| Metric | Value |
|--------|-------|
| Circuit Breaker Threshold | 5 failures |
| Rate Limit | 50 req/min |
| Batch Size | 50 columns |
| Max Concurrent Batches | 5 |
| Quality Threshold | 0.7 |
| Max Retries (Metadata) | 3 |
| Max Retries (Q&A) | 3 |
| Q&A Retry Delay (429) | 60s |
| LLM Timeout | 30s |

---

**End of Technical POC Presentation**
