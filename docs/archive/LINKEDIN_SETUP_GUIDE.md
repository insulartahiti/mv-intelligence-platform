# LinkedIn Integration Setup Guide

## 🚀 Quick Setup Steps

### 1. Create LinkedIn App

1. Go to https://www.linkedin.com/developers/
2. Sign in with your LinkedIn account
3. Click "Create App"
4. Fill in:
   - **App Name**: `MV Intelligence Platform`
   - **LinkedIn Page**: Select your company page
   - **Privacy Policy URL**: `https://your-domain.com/privacy`
   - **App Logo**: Upload your app logo

5. Add Products:
   - ✅ **Sign In with LinkedIn using OpenID Connect**

6. Configure OAuth 2.0 Settings:
   - **Redirect URLs**: 
     - `http://localhost:3000/api/knowledge-graph/linkedin-callback`
   - **Scopes**: 
     - `r_liteprofile`
     - `r_emailaddress`

7. **Copy your credentials**:
   - Client ID: `_________________`
   - Client Secret: `_________________`

### 2. Set Environment Variables

Add these to your Supabase project environment variables:

```bash
LINKEDIN_CLIENT_ID=your_client_id_here
LINKEDIN_CLIENT_SECRET=your_client_secret_here
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/knowledge-graph/linkedin-callback
```

### 3. Test the Integration

1. Go to http://localhost:3000/knowledge-graph
2. Scroll to "LinkedIn Direct API Integration" section
3. Click "Get Auth URL"
4. Click the generated URL to authorize
5. Copy the code from the redirect URL
6. Paste the code in the "LinkedIn Auth Code" field
7. Enter a contact ID
8. Click "Exchange Code"
9. Click "Sync Profile" to test

## 🎯 What This Enables

- **Real-time LinkedIn profile syncing**
- **Automatic connection matching with Affinity**
- **Network analysis and insights**
- **Warm introduction intelligence**
- **Investment relationship mapping**

## 🔧 Troubleshooting

### If you get "undefined" in the auth URL:
- Check that environment variables are set in Supabase
- Redeploy the LinkedIn API function

### If OAuth fails:
- Check redirect URI matches exactly
- Verify scopes are correct
- Check LinkedIn app is approved

### If syncing fails:
- Check LinkedIn app has correct permissions
- Verify contact ID exists in database
- Check function logs for errors

## 📊 Next Steps

Once LinkedIn is working:
1. Test profile syncing
2. Test connection syncing
3. Test Affinity matching
4. Use in universal search
5. Analyze network insights

The LinkedIn integration will enhance your investment intelligence with real-time relationship data!
