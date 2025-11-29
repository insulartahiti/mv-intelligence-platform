# Knowledge Graph Implementation

## Overview

This implementation provides a high-performance, single-tenant knowledge graph that extracts intelligence from Affinity data while keeping files stored in Affinity. The system is designed for speed and scalability, focusing on extracting only the intelligence needed for search and relationship mapping.

## Architecture

### Core Components

1. **Database Schema** (`supabase/migrations/20250102000001_knowledge_graph_schema.sql`)
   - Single-tenant design (no org_id complexity)
   - Optimized for vector search and relationship traversal
   - Minimal data storage (metadata only, files stay in Affinity)

2. **Edge Functions**
   - `sync-affinity-data`: Syncs organizations, persons, interactions, and files from Affinity
   - `process-affinity-files`: Extracts text and generates embeddings from Affinity files
   - `hybrid-search`: Performs vector + text search across the knowledge graph

3. **API Routes**
   - `/api/affinity/sync`: Trigger Affinity data synchronization
   - `/api/knowledge-graph/search`: Search across documents, contacts, and companies
   - `/api/knowledge-graph/process-files`: Process files for text extraction and embeddings

4. **Web Interface**
   - `/knowledge-graph`: Interactive search interface with sync controls

## Key Features

### 🚀 High Performance
- **Vector Search**: OpenAI text-embedding-3-small for semantic search
- **Hybrid Search**: 70% vector + 30% text similarity for optimal results
- **Optimized Indexes**: IVFFlat vector index, GIN text search, relationship graph indexes
- **Single Query**: Hybrid search in one database call

### 🧠 Intelligent Extraction
- **Entity Extraction**: Automatically extracts companies, people, topics, and metrics
- **Relationship Mapping**: Tracks contact-to-contact relationships with strength scoring
- **Warm Paths**: Finds introduction paths between contacts and target companies
- **Context Preservation**: Maintains entity mentions with surrounding context

### 📁 Affinity-Centric
- **File Storage**: All files remain in Affinity, only metadata stored locally
- **Automatic Sync**: Sync organizations, persons, interactions, and file metadata
- **File Processing**: Download and extract text from Affinity files on-demand
- **Cleanup**: No duplicate file storage, efficient data management

## Database Schema

### Core Tables

```sql
-- Companies (linked to Affinity organizations)
companies (
  id, name, domain, affinity_org_id, industry, 
  company_type, website, description, employees,
  funding_stage, revenue_range, location, tags
)

-- Contacts (linked to Affinity persons)
contacts (
  id, name, email, title, affinity_person_id,
  company_id, linkedin_url, tags, last_interaction_at
)

-- Artifacts (metadata only, files stay in Affinity)
artifacts (
  id, affinity_file_id, source_type, title,
  company_id, contact_id, file_type, file_size
)

-- Embeddings (chunked text only)
embeddings (
  id, artifact_id, chunk_text, vector(1536),
  chunk_index, token_count
)

-- Relationships (contact-to-contact graph)
relationships (
  id, from_contact, to_contact, company_id,
  strength, last_interaction, source, interaction_count
)

-- Entities (extracted from text)
entities (
  id, kind, name, aliases, importance, last_seen_at
)

-- Mentions (entity references in artifacts)
mentions (
  id, artifact_id, entity_id, confidence, context
)
```

### Performance Functions

```sql
-- Hybrid search (vector + text)
hybrid_search(query_text, query_vector, limit_count)

-- Warm paths (2-hop relationship traversal)
find_warm_paths(source_contact_id, target_company_id, max_hops)
```

## Deployment

### Prerequisites

1. **Environment Variables**
   ```bash
   export SUPABASE_PROJECT_REF="your-project-ref"
   export AFFINITY_API_KEY="your-affinity-api-key"
   export OPENAI_API_KEY="your-openai-api-key"
   export MV_WEBHOOK_SECRET="your-webhook-secret"
   ```

2. **Supabase CLI**
   ```bash
   npm install -g supabase
   supabase login
   ```

### Deploy

```bash
# Run the deployment script
./scripts/deploy_knowledge_graph.sh
```

This will:
1. Deploy all Edge Functions
2. Set required secrets
3. Apply database migrations
4. Create performance indexes

## Usage

### 1. Initial Setup

```bash
# Sync data from Affinity
curl -X POST "https://your-app.com/api/affinity/sync" \
  -H "Content-Type: application/json" \
  -d '{"sync_type": "all"}'

# Process files for embeddings
curl -X POST "https://your-app.com/api/knowledge-graph/process-files" \
  -H "Content-Type: application/json" \
  -d '{"batch_size": 5}'
```

### 2. Search

```bash
# Hybrid search across documents
curl -X POST "https://your-app.com/api/knowledge-graph/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "fintech companies with RIA connectivity",
    "search_type": "hybrid",
    "limit": 20
  }'

# Search contacts
curl -X POST "https://your-app.com/api/knowledge-graph/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "who has good RIA connectivity",
    "search_type": "contacts",
    "limit": 10
  }'

# Find warm paths for introductions
curl -X POST "https://your-app.com/api/knowledge-graph/search" \
  -H "Content-Type: application/json" \
  -d '{
    "search_type": "warm_paths",
    "source_contact_id": "contact-uuid",
    "target_company_id": "company-uuid",
    "k": 5
  }'
```

### 3. Web Interface

Visit `/knowledge-graph` in your web app to:
- Sync data from Affinity
- Process files for embeddings
- Search across documents, contacts, and companies
- Find warm paths for introductions

## API Reference

### Sync Affinity Data

**POST** `/api/affinity/sync`

```json
{
  "sync_type": "all" | "organizations" | "persons" | "interactions" | "files"
}
```

**Response:**
```json
{
  "ok": true,
  "results": {
    "organizations": {"synced": 150, "total": 150},
    "persons": {"synced": 500, "total": 500},
    "interactions": {"synced": 1200, "total": 1200},
    "files": {"synced": 75, "total": 75}
  }
}
```

### Search Knowledge Graph

**POST** `/api/knowledge-graph/search`

```json
{
  "query": "search terms",
  "search_type": "hybrid" | "contacts" | "companies" | "warm_paths" | "all",
  "limit": 20,
  "source_contact_id": "uuid", // for warm_paths
  "target_company_id": "uuid", // for warm_paths
  "k": 5 // for warm_paths
}
```

**Response:**
```json
{
  "ok": true,
  "results": {
    "hybrid": [
      {
        "artifact_id": "uuid",
        "chunk_text": "relevant text...",
        "title": "Document Title",
        "company_name": "Company Name",
        "combined_score": 0.85
      }
    ],
    "contacts": [...],
    "companies": [...],
    "warm_paths": [...]
  }
}
```

### Process Files

**POST** `/api/knowledge-graph/process-files`

```json
{
  "artifact_id": "uuid", // optional, process specific artifact
  "batch_size": 5 // optional, process batch of unprocessed files
}
```

## Performance Characteristics

### Expected Performance
- **Search Latency**: <100ms for most queries
- **Ingestion Speed**: 100+ documents/minute
- **Storage Efficiency**: 90%+ reduction vs storing raw files
- **Scalability**: Handle 100K+ documents, 1M+ relationships

### Optimization Features
- **Vector Index**: IVFFlat with 100 lists for fast similarity search
- **Text Search**: GIN indexes on full-text search vectors
- **Relationship Graph**: Optimized indexes for 2-hop traversal
- **Chunking**: Smart text chunking with sentence boundary detection
- **Caching**: Query result caching for frequent searches

## Monitoring

### Key Metrics
- **Sync Success Rate**: Monitor Affinity API sync success
- **Processing Rate**: Track file processing throughput
- **Search Performance**: Monitor query latency and accuracy
- **Entity Extraction**: Track entity extraction quality

### Health Checks
- **Database Connectivity**: Verify Supabase connection
- **Affinity API**: Check Affinity API availability
- **OpenAI API**: Monitor embedding generation success
- **Function Health**: Edge function response times

## Troubleshooting

### Common Issues

1. **Sync Failures**
   - Check Affinity API key and permissions
   - Verify network connectivity
   - Review rate limiting

2. **File Processing Errors**
   - Ensure OpenAI API key is valid
   - Check file format support
   - Verify file download permissions

3. **Search Performance**
   - Monitor vector index health
   - Check query complexity
   - Review database performance

### Debug Mode

Enable debug logging by setting:
```bash
export DEBUG=true
```

## Future Enhancements

### Planned Features
1. **Real-time Sync**: Webhook-based real-time Affinity sync
2. **Advanced Analytics**: Relationship strength analytics and insights
3. **Custom Entities**: User-defined entity types and extraction rules
4. **Multi-modal Search**: Image and document search capabilities
5. **API Rate Limiting**: Intelligent rate limiting and queuing

### Integration Opportunities
1. **Email Integration**: Direct email content extraction
2. **Calendar Integration**: Meeting and event data sync
3. **Slack Integration**: Message and thread processing
4. **News APIs**: External news and market data integration

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review Edge function logs in Supabase dashboard
3. Monitor API response times and error rates
4. Verify environment variables and permissions
