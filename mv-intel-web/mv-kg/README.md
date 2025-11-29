# MV Intelligence — Knowledge Graph & Warm Paths (Single-Tenant, RLS On)

Production-ready baseline for MV Intelligence:
- **Schema**: artifacts/chunks/entities/mentions/relations
- **Network**: contacts/companies/contact_company_link/interactions/edges_contact_contact
- **Edge Functions**: ingest-artifact, embed-chunks, enrich-chunk, enrich-pending, search-hybrid, warm-paths
- **Web**: Next.js App Router page at `web/app/graph/page.tsx` (Search + Warm Paths)
- **RLS**: authenticated-only (anonymous blocked)

## Quick start
```bash
cp .env.example .env
export $(grep -v '^#' .env | xargs)

./scripts/migrate.sh
./scripts/deploy_functions.sh
```

### Try it
```bash
# Ingest
curl -s -X POST "$SUPABASE_URL/functions/v1/ingest-artifact"   -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"   -H "Content-Type: application/json" -d @- <<'JSON'
{
  "source_type": "web",
  "source_url": "https://example.com/post",
  "external_id": "example:post:1",
  "title": "Test Post",
  "raw_text": "Acme Bank partnered with FinRail to launch an open banking API..."
}
JSON

# Embed & Enrich
curl -s -X POST "$SUPABASE_URL/functions/v1/embed-chunks" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
curl -s -X POST "$SUPABASE_URL/functions/v1/enrich-pending" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# Hybrid search
curl -s -X POST "$SUPABASE_URL/functions/v1/search-hybrid"   -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"   -H "Content-Type: application/json" -d '{"q":"Acme Bank partners"}' | jq

# Warm paths (after inserting network data)
curl -s -X POST "$SUPABASE_URL/functions/v1/warm-paths"   -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"   -H "Content-Type: application/json"   -d '{"sourceContactId":"<contact-id>","targetCompanyId":"<company-id>","k":5}' | jq
```
