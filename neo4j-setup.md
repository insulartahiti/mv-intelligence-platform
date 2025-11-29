# Neo4j AuraDB Free Setup Guide

## 1. Create AuraDB Free Instance

1. Go to https://console.neo4j.io/
2. Sign up/Login with your account
3. Click "New Instance" → "AuraDB Free"
4. Configure:
   - **Instance Name**: `mv-intelligence-graph`
   - **Region**: Choose closest to your users
   - **Database Name**: `neo4j` (default)
5. Save the connection details:
   - **Connection URI**: `neo4j+s://xxxxx.databases.neo4j.io`
   - **Username**: `neo4j`
   - **Password**: `[generated password]`

## 2. Environment Variables

Add these to your `.env.local` file:

```bash
# Neo4j AuraDB Configuration
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_generated_password
NEO4J_DATABASE=neo4j
```

## 3. Install Neo4j Driver

```bash
cd mv-intel-web
npm install neo4j-driver
```

## 4. Test Connection

Run the connection test script to verify everything works.

## Data Scale
- **Entities**: 29,078
- **Edges**: 43,520
- **AuraDB Free Limits**: 50K nodes, 175K relationships ✅
