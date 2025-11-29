# MV Intelligence Platform - Database Structure Analysis

## 🏗️ **Database Architecture Overview**

### **Core Schema Structure:**
- **Public Schema**: REST API accessible tables and views
- **Graph Schema**: Core knowledge graph tables (not directly REST accessible)
- **Views**: Bridge between graph schema and public API access

### **Key Tables & Data Counts:**

#### **📊 Core Data Tables:**
- **`entities_view`**: 7,249 entities (companies, people, organizations)
- **`edges_view`**: 8,315 relationships/connections
- **`sync_state_view`**: Sync status tracking

#### **🔗 Graph Schema (Internal):**
- **`graph.entities`**: Core entity table with embeddings
- **`graph.edges`**: Relationship connections
- **`graph.sync_state`**: Sync management

#### **📁 Supporting Tables:**
- **`artifacts`**: 0 records (file/document storage)
- **`companies`**: 0 records (legacy table)
- **`contacts`**: 0 records (legacy table)
- **`entities`**: 0 records (legacy table)

### **🤖 AI & Intelligence Features:**

#### **✅ Embeddings Status:**
- **4 entities** have embeddings (vector(1536) dimensions)
- **Embedding Strategy**: Hybrid approach with HNSW indexes
- **Vector Search**: Enabled via pgvector extension

#### **🔄 Sync Status:**
- **Last Sync**: 2025-10-12T00:02:53.734+00:00
- **Entities Synced**: 500 (incremental)
- **Edges Synced**: 0
- **Status**: Idle (not currently running)
- **Rate Limit**: 300 remaining

### **🚨 Critical Issues Identified:**

#### **1. Data Quality Problem:**
- **Malformed Person Names**: Entities like "Michael Hock ; Maria Anthony <maria.anthony@motivepartners.com>"
- **Root Cause**: Data ingestion concatenated multiple person names
- **Impact**: Node detail panels show confusing combined names

#### **2. Sync Process Status:**
- **Affinity Sync**: Not currently running
- **Edge Sync**: 0 edges synced (major gap)
- **Files Sync**: 0 files synced

#### **3. Embeddings Coverage:**
- **Only 4/7,249 entities** have embeddings (0.05% coverage)
- **Missing**: Semantic search capabilities

### **📋 Available Data Fields:**

#### **Entity Fields (45+ columns):**
- Basic: `id`, `name`, `type`, `domain`, `industry`
- Business: `pipeline_stage`, `fund`, `taxonomy`, `valuation_amount`
- Location: `location_city`, `location_country`
- Flags: `is_internal`, `is_pipeline`, `is_portfolio`
- AI: `embedding`, `enrichment_data`, `employment_history`
- External: `affinity_person_id`, `affinity_org_id`, `linkedin_url`

#### **Edge Fields (15+ columns):**
- Core: `id`, `source`, `target`, `kind`, `strength_score`
- Interaction: `interaction_count`, `last_interaction_date`
- Context: `relationship_context`, `relationship_notes`
- Confidence: `confidence_score`, `source_type`

### **🎯 Immediate Action Items:**

#### **Priority 1 - Data Quality:**
1. **Fix Malformed Person Names**: Clean up concatenated names in database
2. **Validate Entity Types**: Ensure proper person vs organization classification

#### **Priority 2 - Sync Processes:**
1. **Restart Affinity Sync**: Get fresh data from Affinity CRM
2. **Enable Edge Sync**: Sync relationship data (currently 0 edges)
3. **File Sync**: Enable document/file synchronization

#### **Priority 3 - AI Features:**
1. **Scale Embeddings**: Generate embeddings for all 7,249 entities
2. **Enable Semantic Search**: Implement vector similarity search
3. **Intelligence Overlays**: Connect AI insights to entities

### **🔧 Technical Implementation:**

#### **Current Working Components:**
- ✅ Graph visualization (50+ nodes with edges)
- ✅ Node detail panels (showing real data)
- ✅ API endpoints (all responding correctly)
- ✅ Database schema (comprehensive structure)

#### **Missing Components:**
- ❌ Background sync processes
- ❌ Embedding generation pipeline
- ❌ Data quality validation
- ❌ Semantic search functionality

### **📈 Next Steps:**
1. **Fix person name data quality issues**
2. **Restart and monitor sync processes**
3. **Scale embedding generation to full dataset**
4. **Implement semantic search capabilities**
5. **Add intelligence overlays and insights**

---
*Last Updated: $(date)*
*Total Entities: 7,249 | Total Edges: 8,315 | Embeddings: 4*
