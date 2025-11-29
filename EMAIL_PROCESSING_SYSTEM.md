# Email Processing System Documentation

## Overview

The MV Intelligence Platform now includes a comprehensive email processing system that automatically extracts intelligence from portfolio-related emails using GPT-5 and integrates with the knowledge graph.

## Key Features

### 1. **Unified Inbox**
- Centralized email processing for portfolio updates
- Automatic portfolio relevance detection
- Priority-based email processing
- Real-time queue management

### 2. **GPT-5 Integration**
- Advanced email content analysis
- Entity extraction (companies, people, metrics, topics)
- Sentiment analysis across business dimensions
- Financial data extraction and trend analysis
- Actionable insights generation

### 3. **Knowledge Graph Integration**
- Automatic entity linking to portfolio companies
- Relationship mapping between emails and companies
- Intelligence overlay updates
- Embedding generation for semantic search

### 4. **Queue Processing System**
- Batch processing of pending emails
- Error handling and retry logic
- Status tracking (pending, processing, processed, failed)
- Performance monitoring

## Architecture

### Database Schema

#### `email_inbox` Table
```sql
- id: UUID (Primary Key)
- email_id: TEXT (Unique)
- subject: TEXT
- from_email: TEXT
- to_email: TEXT
- email_date: TIMESTAMPTZ
- content: TEXT
- html_content: TEXT
- attachments: JSONB
- status: TEXT (pending|processing|processed|failed)
- priority: TEXT (low|medium|high|urgent)
- portfolio_relevant: BOOLEAN
- processed_at: TIMESTAMPTZ
- error_message: TEXT
```

#### `email_analysis` Table
```sql
- id: UUID (Primary Key)
- email_id: TEXT (Unique)
- analysis_data: JSONB
- company_links: JSONB
- extracted_kpis: JSONB
- insights: JSONB
- processed_at: TIMESTAMPTZ
```

#### `email_insights` Table
```sql
- id: UUID (Primary Key)
- email_id: TEXT
- insight_type: TEXT
- title: TEXT
- content: TEXT
- confidence: DECIMAL(3,2)
- priority: TEXT
- actionable: BOOLEAN
- company_id: UUID (Foreign Key)
- source: TEXT
```

### API Endpoints

#### 1. **Email Inbox Management**
- `GET /api/emails/inbox` - Retrieve inbox emails with filtering
- `POST /api/emails/inbox` - Add email to inbox

#### 2. **Email Processing**
- `POST /api/emails/process` - Process individual email with GPT-5
- `POST /api/emails/process-queue` - Process batch of pending emails
- `GET /api/emails/process-queue` - Get queue status

#### 3. **Knowledge Graph Integration**
- `POST /api/knowledge-graph/email-integration` - Integrate email with knowledge graph
- `GET /api/knowledge-graph/email-integration` - Retrieve email knowledge graph data

## GPT-5 Analysis Capabilities

### Entity Extraction
- **Companies**: Portfolio company identification and linking
- **People**: Key personnel mentioned in emails
- **Metrics**: Financial KPIs and performance indicators
- **Topics**: Business themes and strategic areas
- **Actions**: Actionable items and next steps

### Sentiment Analysis
- **Overall Sentiment**: Positive, negative, or neutral
- **Business Sentiment**: Strategic and operational outlook
- **Financial Sentiment**: Revenue and growth prospects
- **Operational Sentiment**: Execution and team performance

### Financial Data Extraction
- **Metrics**: ARR, MRR, churn rate, customer growth, etc.
- **Trends**: Direction and magnitude of changes
- **Periods**: Time-based context for metrics
- **Confidence**: Reliability scores for extracted data

### Insight Generation
- **Opportunities**: Growth potential and strategic openings
- **Risks**: Potential challenges and concerns
- **Actions**: Recommended next steps
- **Trends**: Market and business pattern recognition

## Usage Examples

### 1. Adding Email to Inbox
```javascript
const response = await fetch('/api/emails/inbox', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    emailId: 'email-001',
    subject: 'Q4 Portfolio Update',
    from: 'ceo@company.com',
    to: 'portfolio@mvintel.com',
    content: 'Email content...',
    priority: 'high'
  })
});
```

### 2. Processing Email Queue
```javascript
const response = await fetch('/api/emails/process-queue', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ batchSize: 5 })
});
```

### 3. Retrieving Portfolio Emails
```javascript
const response = await fetch('/api/emails/inbox?portfolio_relevant=true');
const { portfolioEmails } = await response.json();
```

## UI Components

### UnifiedInbox Component
- **Queue Status Dashboard**: Real-time processing statistics
- **Email List**: Filterable and searchable email display
- **Portfolio Emails**: Dedicated section for portfolio-relevant emails
- **Email Detail Modal**: Comprehensive email analysis display
- **Processing Controls**: Manual queue processing triggers

### Features
- **Real-time Updates**: Live queue status and email processing
- **Advanced Filtering**: By status, priority, and portfolio relevance
- **Search Functionality**: Full-text search across email content
- **Insight Display**: AI-generated insights and recommendations
- **Company Linking**: Automatic portfolio company association

## Knowledge Graph Integration

### Entity Processing
1. **Extraction**: GPT-5 identifies entities in email content
2. **Linking**: Automatic matching to existing portfolio companies
3. **Storage**: Entities stored in knowledge graph with confidence scores
4. **Relationships**: Email-company relationships established

### Intelligence Overlays
1. **Analysis Storage**: Email analysis stored as intelligence overlay
2. **Company Updates**: Portfolio companies updated with new insights
3. **Metric Tracking**: KPIs extracted and linked to companies
4. **Trend Analysis**: Financial trends tracked over time

### Embedding Generation
1. **Text Processing**: Email content prepared for embedding
2. **Vector Generation**: OpenAI embeddings created for semantic search
3. **Storage**: Embeddings stored for knowledge graph search
4. **Retrieval**: Semantic search across email content

## Configuration

### Environment Variables
```bash
OPENAI_API_KEY=your_openai_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Database Setup
```bash
# Run migrations
supabase db reset

# Or apply specific migration
supabase migration up
```

## Testing

### Test Script
```bash
node test_email_processing.js
```

### Manual Testing
1. **Add Test Email**: Use the inbox API to add sample emails
2. **Process Queue**: Trigger queue processing manually
3. **Verify Results**: Check database for processed data
4. **Test UI**: Use the unified inbox interface

## Performance Considerations

### Batch Processing
- **Queue Size**: Process emails in batches of 5-10
- **Rate Limiting**: Respect OpenAI API rate limits
- **Error Handling**: Robust retry logic for failed processing
- **Monitoring**: Track processing times and success rates

### Database Optimization
- **Indexes**: Optimized indexes for common queries
- **Partitioning**: Consider partitioning for large email volumes
- **Cleanup**: Regular cleanup of old processed emails
- **Archiving**: Archive processed emails to reduce active table size

## Security

### Data Protection
- **RLS Policies**: Row-level security for all email tables
- **API Authentication**: Secure API endpoints with proper authentication
- **Data Encryption**: Sensitive email content encrypted at rest
- **Access Control**: Role-based access to email processing features

### Privacy Compliance
- **Data Retention**: Configurable email retention policies
- **PII Handling**: Proper handling of personally identifiable information
- **Audit Logging**: Comprehensive audit trail for email processing
- **Consent Management**: Email processing consent tracking

## Future Enhancements

### Planned Features
1. **Email Thread Analysis**: Process entire email conversations
2. **Attachment Processing**: Extract data from email attachments
3. **Real-time Processing**: WebSocket-based real-time email processing
4. **Advanced Analytics**: Email pattern analysis and insights
5. **Integration APIs**: Connect with external email providers

### Scalability Improvements
1. **Distributed Processing**: Multi-instance email processing
2. **Caching Layer**: Redis-based caching for frequent queries
3. **Message Queues**: RabbitMQ or similar for reliable processing
4. **Microservices**: Break down into smaller, focused services

## Troubleshooting

### Common Issues
1. **Migration Conflicts**: Check for duplicate migration timestamps
2. **API Rate Limits**: Monitor OpenAI API usage and implement backoff
3. **Database Locks**: Optimize queries and use proper indexing
4. **Memory Issues**: Monitor memory usage during batch processing

### Debug Tools
1. **Queue Status**: Use the queue status API to monitor processing
2. **Error Logs**: Check application logs for processing errors
3. **Database Queries**: Use Supabase dashboard for query analysis
4. **Performance Metrics**: Monitor API response times and success rates

## Support

For issues or questions about the email processing system:
1. Check the troubleshooting section
2. Review the API documentation
3. Test with the provided test script
4. Check the application logs for detailed error information






