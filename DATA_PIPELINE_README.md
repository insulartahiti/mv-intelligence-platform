# Data Ingestion & Maintenance Guide

## Overview
The data pipeline is designed to be self-healing and context-aware. It consists of three main phases: **Cleanup**, **Enrichment**, and **Relationship Extraction**.

## How to Run (Automatic Mode)
Whenever you add new data (e.g., import a CSV), simply run the master pipeline script. This handles everything in the correct order.

```bash
node mv-intel-web/scripts/run_pipeline.js
```

### What it Does:
1.  **Initial Cleanup**: Removes garbage (e.g., merged email names, generic titles) and deduplicates existing entities.
2.  **Organization Enrichment**: Enriches companies first (using connected people as context if domain is missing).
3.  **Person Enrichment**: Enriches people (using connected companies as context if domain is missing).
4.  **Relationship Extraction**: Infers new edges from the AI analysis (runs in "once" mode).
5.  **Final Cleanup**: Deduplicates any new entities created by inference.

## Manual / Individual Scripts
If you need to debug or run specific parts:

### 1. Systematic Cleanup
Runs garbage collection and intelligent deduplication (merging edges to the best profile).
```bash
node mv-intel-web/scripts/systematic_cleanup.js
```

### 2. Enrichment (Incremental)
Only processes entities that haven't been enriched yet.
```bash
# Organizations
node mv-intel-web/enhanced_embedding_generator.js --incremental

# People
node mv-intel-web/enhanced_person_embedding_generator.js --incremental
```

### 3. Relationship Extraction
Extracts connections from business analysis.
```bash
# Run continuously (daemon mode)
node mv-intel-web/scripts/generate_relationships.js

# Run once and exit
node mv-intel-web/scripts/generate_relationships.js --run-once
```

