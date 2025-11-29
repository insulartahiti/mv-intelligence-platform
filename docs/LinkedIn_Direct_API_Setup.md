# LinkedIn Direct API Integration Setup Guide

## Overview

This guide explains how to set up direct LinkedIn API integration without Zapier dependency. The system provides real-time LinkedIn profile and connection syncing with automatic Affinity contact matching.

## Why Direct API vs Zapier?

### ✅ **Direct API Advantages:**
- **No Middleware**: Direct integration eliminates Zapier dependency
- **Real-time Data**: Direct API calls are more responsive
- **Cost Efficient**: No Zapier subscription required
- **Full Control**: Complete control over data processing and error handling
- **Simpler Architecture**: Fewer moving parts, easier to debug
- **Better Performance**: No webhook delays or processing overhead

### ❌ **Zapier Disadvantages:**
- **Dependency**: Relies on Zapier's LinkedIn integration
- **Limited Control**: Can't customize data fetching logic
- **Webhook Complexity**: Additional webhook handling and security
- **Cost**: Zapier subscription required
- **Latency**: Webhook delays vs direct API calls

## Architecture

### Components

1. **LinkedIn Direct API Edge Function** (`linkedin-api-direct`)
   - Handles OAuth 2.0 flow for LinkedIn authentication
   - Fetches profile data directly from LinkedIn API
   - Retrieves connections using LinkedIn's API
   - Manages token storage and refresh
   - Automatically matches with Affinity contacts

2. **Database Schema**
   - `linkedin_tokens` - Stores OAuth tokens for each contact
   - `linkedin_connections` - Stores first-degree LinkedIn connections
   - `linkedin_mutual_connections` - Stores mutual connections between contacts
   - Enhanced `contacts` table with LinkedIn profile fields

3. **Next.js API Route** (`/api/knowledge-graph/linkedin-direct`)
   - Proxies requests to the LinkedIn API Edge Function
   - Handles authentication and error management

## LinkedIn App Setup

### 1. Create LinkedIn Developer Account

1. Go to [LinkedIn Developer Portal](https://www.linkedin.com/developers/)
2. Sign in with your LinkedIn account
3. Click "Create App"

### 2. Configure LinkedIn App

**Basic Information:**
- **App Name**: `MV Intelligence Platform`
- **LinkedIn Page**: Select your company page
- **Privacy Policy URL**: `https://your-domain.com/privacy`
- **App Logo**: Upload your app logo

**Products:**
- **Sign In with LinkedIn using OpenID Connect**: ✅
- **Share on LinkedIn**: ✅ (optional)
- **Marketing Developer Platform**: ✅ (optional)

**OAuth 2.0 Settings:**
- **Redirect URLs**: 
  - `http://localhost:3000/api/knowledge-graph/linkedin-callback` (development)
  - `https://your-domain.com/api/knowledge-graph/linkedin-callback` (production)
- **Scopes**: 
  - `r_liteprofile` - Read basic profile information
  - `r_emailaddress` - Read email address
  - `w_member_social` - Write member social actions (optional)

### 3. Get API Credentials

After creating the app, you'll get:
- **Client ID**: Your LinkedIn app's client ID
- **Client Secret**: Your LinkedIn app's client secret

## Environment Variables

Add these to your Supabase project environment variables:

```bash
# LinkedIn Direct API
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_REDIRECT_URI=https://your-domain.com/api/knowledge-graph/linkedin-callback
MV_WEBHOOK_SECRET=your_webhook_secret_here
```

## OAuth 2.0 Flow

### 1. Authorization URL Generation

```javascript
// Get LinkedIn authorization URL
const response = await fetch('/api/knowledge-graph/linkedin-direct', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'get_auth_url'
  })
});

const { auth_url } = await response.json();
// Redirect user to auth_url
```

### 2. Handle OAuth Callback

Create a callback page at `/api/knowledge-graph/linkedin-callback`:

```javascript
// pages/api/knowledge-graph/linkedin-callback.js
export default function handler(req, res) {
  const { code, state } = req.query;
  
  if (code) {
    // Exchange code for token
    // This should be handled by your frontend
    res.redirect(`/knowledge-graph?code=${code}`);
  } else {
    res.redirect('/knowledge-graph?error=oauth_failed');
  }
}
```

### 3. Token Exchange

```javascript
// Exchange authorization code for access token
const response = await fetch('/api/knowledge-graph/linkedin-direct', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'exchange_code',
    code: authCode,
    contact_id: contactId
  })
});
```

## API Endpoints

### 1. Get Authorization URL
```javascript
POST /api/knowledge-graph/linkedin-direct
{
  "action": "get_auth_url"
}
```

**Response:**
```json
{
  "ok": true,
  "auth_url": "https://www.linkedin.com/oauth/v2/authorization?...",
  "timestamp": "2025-01-02T00:00:00.000Z"
}
```

### 2. Exchange Code for Token
```javascript
POST /api/knowledge-graph/linkedin-direct
{
  "action": "exchange_code",
  "code": "authorization_code",
  "contact_id": "contact_uuid"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Token stored successfully",
  "timestamp": "2025-01-02T00:00:00.000Z"
}
```

### 3. Sync LinkedIn Profile
```javascript
POST /api/knowledge-graph/linkedin-direct
{
  "action": "sync_profile",
  "contact_id": "contact_uuid"
}
```

**Response:**
```json
{
  "ok": true,
  "profile": {
    "id": "linkedin_profile_id",
    "firstName": "John",
    "lastName": "Doe",
    "headline": "Software Engineer",
    "industry": "Technology",
    "location": "San Francisco, CA",
    "profileUrl": "https://www.linkedin.com/in/johndoe",
    "profilePictureUrl": "https://...",
    "summary": "Experienced software engineer...",
    "currentPosition": {
      "title": "Senior Software Engineer",
      "company": "Tech Company",
      "companyId": "company_id"
    }
  },
  "timestamp": "2025-01-02T00:00:00.000Z"
}
```

### 4. Sync LinkedIn Connections
```javascript
POST /api/knowledge-graph/linkedin-direct
{
  "action": "sync_connections",
  "contact_id": "contact_uuid"
}
```

**Response:**
```json
{
  "ok": true,
  "connections": [
    {
      "id": "connection_id",
      "firstName": "Jane",
      "lastName": "Smith",
      "headline": "Product Manager",
      "industry": "Technology",
      "location": "New York, NY",
      "profileUrl": "https://www.linkedin.com/in/janesmith",
      "currentPosition": {
        "title": "Senior Product Manager",
        "company": "Tech Corp",
        "companyId": "company_id"
      }
    }
  ],
  "count": 150,
  "timestamp": "2025-01-02T00:00:00.000Z"
}
```

### 5. Full Sync (Profile + Connections)
```javascript
POST /api/knowledge-graph/linkedin-direct
{
  "action": "full_sync",
  "contact_id": "contact_uuid"
}
```

## Database Schema

### linkedin_tokens
```sql
CREATE TABLE linkedin_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  scope TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(contact_id)
);
```

### linkedin_connections
```sql
CREATE TABLE linkedin_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
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
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(contact_id, connection_profile_id)
);
```

## Usage Flow

### 1. Initial Setup
1. Create LinkedIn app and get credentials
2. Set environment variables in Supabase
3. Deploy the LinkedIn API Edge Function

### 2. User Authentication
1. User clicks "Get Auth URL" button
2. System generates LinkedIn OAuth URL
3. User is redirected to LinkedIn for authorization
4. User authorizes the app and gets redirected back with code
5. System exchanges code for access token
6. Token is stored securely in database

### 3. Data Syncing
1. User clicks "Sync Profile" to get LinkedIn profile data
2. User clicks "Sync Connections" to get LinkedIn connections
3. User clicks "Full Sync" to sync both profile and connections
4. System automatically matches connections with Affinity contacts

### 4. Network Analysis
1. Use the existing LinkedIn Network Analysis section
2. System analyzes connections and finds mutual connections
3. Generates network insights and recommendations

## Security

### Token Management
- Access tokens are stored securely in database
- Automatic token refresh when expired
- Tokens are encrypted and not logged

### OAuth Security
- State parameter validation (implement in production)
- Secure redirect URI validation
- Proper scope management

### Data Privacy
- LinkedIn data is stored securely in Supabase
- RLS policies control data access
- No sensitive data logged in function logs

## LinkedIn API Limitations

### Current Limitations
1. **Connections API**: Requires special approval from LinkedIn
2. **Mutual Connections**: Not directly available via API
3. **Rate Limits**: 100 requests per user per day for most endpoints

### Workarounds
1. **Connections**: Use LinkedIn's people search API with network filters
2. **Mutual Connections**: Implement alternative matching algorithms
3. **Rate Limits**: Implement proper rate limiting and caching

## Troubleshooting

### Common Issues

1. **OAuth Errors**
   - Check redirect URI configuration
   - Verify client ID and secret
   - Ensure proper scopes are requested

2. **Token Expiration**
   - Implement automatic token refresh
   - Handle refresh token expiration gracefully
   - Re-authenticate users when needed

3. **API Rate Limits**
   - Implement exponential backoff
   - Cache responses when possible
   - Monitor API usage

4. **Connection Syncing Issues**
   - LinkedIn connections API requires special approval
   - Use alternative approaches for connection data
   - Implement manual connection import

### Debugging

1. **Check Function Logs**
   ```bash
   supabase functions logs linkedin-api-direct --follow
   ```

2. **Test OAuth Flow**
   ```bash
   curl -X POST "http://localhost:3000/api/knowledge-graph/linkedin-direct" \
     -H "Content-Type: application/json" \
     -d '{"action": "get_auth_url"}'
   ```

3. **Check Database**
   ```sql
   SELECT * FROM linkedin_tokens WHERE contact_id = 'uuid';
   SELECT * FROM linkedin_connections WHERE contact_id = 'uuid';
   ```

## Best Practices

### 1. Error Handling
- Implement comprehensive error handling
- Provide user-friendly error messages
- Log errors for debugging

### 2. Rate Limiting
- Respect LinkedIn's rate limits
- Implement exponential backoff
- Cache responses when appropriate

### 3. Security
- Validate all inputs
- Use HTTPS for all communications
- Implement proper token management

### 4. User Experience
- Provide clear instructions for OAuth flow
- Show progress indicators during syncing
- Handle errors gracefully

## Future Enhancements

### 1. Advanced Features
- Real-time connection updates
- Advanced network analysis
- Relationship strength scoring

### 2. Integration Improvements
- Batch processing for large datasets
- Background sync jobs
- Webhook support for real-time updates

### 3. Analytics
- Connection growth tracking
- Network analysis metrics
- Relationship insights

## Migration from Zapier

If you're migrating from Zapier:

1. **Export existing data** from Zapier if needed
2. **Set up LinkedIn app** and get credentials
3. **Deploy direct API integration**
4. **Migrate users** to new OAuth flow
5. **Update data processing** to use direct API
6. **Remove Zapier dependencies**

The direct API integration provides better performance, more control, and eliminates the Zapier dependency while maintaining all the same functionality!
