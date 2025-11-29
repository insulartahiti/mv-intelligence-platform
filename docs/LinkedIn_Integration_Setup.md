# LinkedIn Integration Setup Guide

## Overview

This guide explains how to set up LinkedIn integration via Zapier to enhance the knowledge graph with comprehensive network analysis, mutual connections, and relationship intelligence.

## Architecture

### Components

1. **LinkedIn Network Analysis Edge Function** (`linkedin-network-analysis`)
   - Analyzes LinkedIn profiles and connections
   - Finds mutual connections between contacts
   - Matches LinkedIn connections with Affinity contacts
   - Generates network insights and recommendations

2. **Zapier LinkedIn Webhook** (`zapier-linkedin-webhook`)
   - Receives LinkedIn data from Zapier
   - Updates contact profiles with LinkedIn information
   - Stores connection data and mutual connections
   - Automatically matches with Affinity contacts

3. **Database Schema**
   - `linkedin_network_analysis` - Stores comprehensive network analysis results
   - `linkedin_connections` - Stores first-degree LinkedIn connections
   - `linkedin_mutual_connections` - Stores mutual connections between contacts
   - Enhanced `contacts` table with LinkedIn profile fields

## Zapier Setup

### 1. Create Zapier Account and LinkedIn App

1. Go to [Zapier.com](https://zapier.com) and create an account
2. Create a new LinkedIn app in the LinkedIn Developer Portal
3. Get your LinkedIn API credentials (Client ID, Client Secret)

### 2. Create Zapier Zaps

#### Zap 1: LinkedIn Profile Sync
- **Trigger**: Manual or scheduled trigger
- **Action**: LinkedIn API - Get Profile
- **Webhook**: Send to `zapier-linkedin-webhook` Edge Function

#### Zap 2: LinkedIn Connections Sync
- **Trigger**: Manual or scheduled trigger
- **Action**: LinkedIn API - Get Connections
- **Webhook**: Send to `zapier-linkedin-webhook` Edge Function

#### Zap 3: Mutual Connections Sync
- **Trigger**: Manual or scheduled trigger
- **Action**: LinkedIn API - Get Mutual Connections
- **Webhook**: Send to `zapier-linkedin-webhook` Edge Function

### 3. Webhook Configuration

For each Zap, configure the webhook to send data to:
```
https://your-project.supabase.co/functions/v1/zapier-linkedin-webhook
```

Headers:
```
Content-Type: application/json
x-mv-signature: YOUR_WEBHOOK_SECRET
```

## Data Flow

### 1. Profile Update Flow
```
LinkedIn API → Zapier → Webhook → Database Update
```

**Webhook Payload:**
```json
{
  "action": "profile_update",
  "contact_id": "uuid",
  "profile_data": {
    "linkedin_profile_id": "string",
    "first_name": "string",
    "last_name": "string",
    "headline": "string",
    "industry": "string",
    "location": "string",
    "profile_url": "string",
    "profile_picture_url": "string",
    "summary": "string",
    "current_position": {
      "title": "string",
      "company": "string",
      "company_id": "string"
    },
    "connections_count": 500
  }
}
```

### 2. Connections Update Flow
```
LinkedIn API → Zapier → Webhook → Database Storage + Affinity Matching
```

**Webhook Payload:**
```json
{
  "action": "connections_update",
  "contact_id": "uuid",
  "connections_data": [
    {
      "profile_id": "string",
      "first_name": "string",
      "last_name": "string",
      "headline": "string",
      "industry": "string",
      "location": "string",
      "profile_url": "string",
      "profile_picture_url": "string",
      "current_position": {
        "title": "string",
        "company": "string",
        "company_id": "string"
      },
      "mutual_connections_count": 10
    }
  ]
}
```

### 3. Mutual Connections Flow
```
LinkedIn API → Zapier → Webhook → Database Storage + Affinity Matching
```

**Webhook Payload:**
```json
{
  "action": "mutual_connections_update",
  "contact_id": "uuid",
  "target_contact_id": "uuid",
  "mutual_connections_data": [
    {
      "profile_id": "string",
      "first_name": "string",
      "last_name": "string",
      "headline": "string",
      "industry": "string",
      "location": "string",
      "profile_url": "string",
      "profile_picture_url": "string",
      "current_position": {
        "title": "string",
        "company": "string",
        "company_id": "string"
      }
    }
  ]
}
```

## Environment Variables

Add these to your Supabase project environment variables:

```bash
# LinkedIn Integration
ZAPIER_LINKEDIN_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/YOUR_WEBHOOK_ID/
MV_WEBHOOK_SECRET=your_webhook_secret_here
```

## Usage

### 1. Analyze LinkedIn Network

```javascript
// Via API
const response = await fetch('/api/knowledge-graph/linkedin-network', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'analyze_network',
    contact_id: 'contact-uuid',
    target_contact_id: 'target-contact-uuid' // optional
  })
});
```

### 2. Get Analysis Results

```javascript
// Via API
const response = await fetch('/api/knowledge-graph/linkedin-network', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'get_analysis',
    contact_id: 'contact-uuid'
  })
});
```

## Network Analysis Features

### 1. Profile Analysis
- LinkedIn profile information
- Connection count and network size
- Industry and location data
- Current position and company

### 2. Connection Analysis
- First-degree connections
- Industry distribution
- Seniority distribution
- Company distribution
- Connection strength scoring

### 3. Mutual Connections
- Shared connections between contacts
- Warm introduction opportunities
- Network overlap analysis
- Strategic relationship mapping

### 4. Affinity Matching
- Automatic matching with Affinity contacts
- Confidence scoring based on:
  - Name similarity
  - Company matching
  - Title matching
  - Industry alignment
- Match reasons and explanations

### 5. Network Insights
- Total connections count
- Mutual connections count
- Affinity overlap percentage
- Strategic value scoring
- Warm introduction potential

### 6. Recommendations
- Immediate actions
- Relationship building strategies
- Warm introduction opportunities
- Strategic partnership potential

## Database Schema

### linkedin_network_analysis
```sql
CREATE TABLE linkedin_network_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(id),
  analysis_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### linkedin_connections
```sql
CREATE TABLE linkedin_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(id),
  connection_profile_id VARCHAR(255) NOT NULL,
  connection_name VARCHAR(255) NOT NULL,
  connection_title VARCHAR(255),
  connection_company VARCHAR(255),
  connection_industry VARCHAR(255),
  connection_location VARCHAR(255),
  connection_profile_url TEXT,
  connection_picture_url TEXT,
  mutual_connections_count INTEGER DEFAULT 0,
  connection_strength DECIMAL(3,2) DEFAULT 0.5,
  is_affinity_contact BOOLEAN DEFAULT FALSE,
  affinity_contact_id UUID REFERENCES contacts(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### linkedin_mutual_connections
```sql
CREATE TABLE linkedin_mutual_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(id),
  target_contact_id UUID NOT NULL REFERENCES contacts(id),
  mutual_connection_profile_id VARCHAR(255) NOT NULL,
  mutual_connection_name VARCHAR(255) NOT NULL,
  mutual_connection_title VARCHAR(255),
  mutual_connection_company VARCHAR(255),
  mutual_connection_industry VARCHAR(255),
  mutual_connection_location VARCHAR(255),
  mutual_connection_profile_url TEXT,
  connection_strength DECIMAL(3,2) DEFAULT 0.5,
  is_affinity_contact BOOLEAN DEFAULT FALSE,
  affinity_contact_id UUID REFERENCES contacts(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Security

### Webhook Security
- All webhooks require `x-mv-signature` header
- Signature must match `MV_WEBHOOK_SECRET` environment variable
- Rate limiting and validation on all endpoints

### Data Privacy
- LinkedIn data is stored securely in Supabase
- RLS policies control data access
- No sensitive data logged in function logs

## Troubleshooting

### Common Issues

1. **Webhook Not Receiving Data**
   - Check Zapier webhook configuration
   - Verify webhook URL and headers
   - Check Supabase function logs

2. **Affinity Matching Not Working**
   - Ensure contacts exist in Affinity database
   - Check matching algorithm confidence thresholds
   - Verify data quality and completeness

3. **LinkedIn API Rate Limits**
   - Implement proper rate limiting in Zapier
   - Use batch processing for large datasets
   - Monitor API usage and quotas

### Debugging

1. **Check Function Logs**
   ```bash
   supabase functions logs linkedin-network-analysis --follow
   supabase functions logs zapier-linkedin-webhook --follow
   ```

2. **Test Webhook Manually**
   ```bash
   curl -X POST "https://your-project.supabase.co/functions/v1/zapier-linkedin-webhook" \
     -H "Content-Type: application/json" \
     -H "x-mv-signature: YOUR_SECRET" \
     -d '{"action": "profile_update", "contact_id": "uuid", "profile_data": {...}}'
   ```

3. **Check Database Data**
   ```sql
   SELECT * FROM linkedin_network_analysis WHERE contact_id = 'uuid';
   SELECT * FROM linkedin_connections WHERE contact_id = 'uuid';
   SELECT * FROM linkedin_mutual_connections WHERE contact_id = 'uuid';
   ```

## Best Practices

1. **Data Quality**
   - Regularly sync LinkedIn data
   - Validate data before processing
   - Handle missing or incomplete data gracefully

2. **Performance**
   - Use batch processing for large datasets
   - Implement proper indexing
   - Monitor function execution times

3. **Privacy**
   - Respect LinkedIn's data usage policies
   - Implement proper data retention policies
   - Ensure GDPR compliance

4. **Monitoring**
   - Set up alerts for failed webhooks
   - Monitor API rate limits
   - Track data quality metrics

## Future Enhancements

1. **Real-time Updates**
   - WebSocket connections for live updates
   - Push notifications for new connections
   - Real-time mutual connection updates

2. **Advanced Analytics**
   - Network growth tracking
   - Influence scoring
   - Relationship strength analysis

3. **Integration Expansion**
   - Additional social networks
   - CRM integrations
   - Email signature analysis

4. **AI Enhancements**
   - Automated relationship scoring
   - Predictive connection recommendations
   - Intelligent warm introduction suggestions
