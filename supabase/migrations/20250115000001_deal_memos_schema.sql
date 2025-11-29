-- Deal Memos Schema for MV Intelligence Platform
-- Creates the deal_memos table and related structures

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Deal memos: markdown drafts tied to a company and optional opportunity id
CREATE TABLE IF NOT EXISTS deal_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid, -- Default org for now
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  opportunity_id TEXT, -- from Affinity or cache
  title TEXT,
  markdown TEXT,
  last_drafted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS dm_company_idx ON deal_memos(company_id);
CREATE INDEX IF NOT EXISTS dm_org_idx ON deal_memos(org_id);
CREATE INDEX IF NOT EXISTS dm_opportunity_idx ON deal_memos(opportunity_id);

-- Templates table to store memo template
CREATE TABLE IF NOT EXISTS templates (
  key TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the MV memo template
INSERT INTO templates(key, content) VALUES
  ('mv_memo_template', $$# MASTER MV Memo Template

Status: Back-up

# Investment Memo

*N.B. All figures are in **XXX currency** unless noted otherwise*

# **00. Situation & Status**

- Key transaction details (e.g. check size, round size, valuation/ownership, co-investors, timeline)
- Process status (as needed)

# Executive Summary

### Business Description

- One bullet on what business does
- One or two bullets on product
- One bullet on vision

### Why Will This Team Succeed?

- []

### Why Is This Market Attractive?

- []

### What Is The Critical Pain Point This Product Solves?

- []

### What Evidence Is There That The Business Is Operating At Venture Velocity?

- []

### How Does The Business Benchmark?

*[Instructions: choose business model option based on main revenue streams below and fill in KPIs accordingly. Delete KPIs/KPI drop-downs irrelevant to target]*

*Applicable for seed and series A stage businesses (have raised between $1-10M of capital)* 

- **SAAS**
    
    
    | **Metric** | **Benchmark POOR** | **Benchmark GOOD** | **Benchmark GREAT** | **Value [Company] [time period]**   | **Outlook [Company] [time period]** | **Commentary** |
    | --- | --- | --- | --- | --- | --- | --- |
    | **Time to $1M ARR from Launch** | >18 months | 12-18 months | <12 months |  |  |  |
    | **ARR Growth YoY** | <100% | 100-150% | >150%  |  |  |  |
    | **Gross Margin** | <70% | 70-85% | >85% |  |  |  |
    | **NRR** | <100%  | 100-140% | >140% |  |  |  |
    | **LTV/CAC** | <3.0x | 3.0x-7.0x  | >7.0x |  |  |  |
    | **CAC Payback** | >12 months | 6-12 months | <6 months |  |  |  |
    | **Burn Multiple**  | >2.0x  | 1.5-2.0x | <1.5x |  |  |  |
    | **Churn MoM** | >5% | 1.5-5.0% | <1.5% |  |  |  |
    | **Conversion Rate Raw Lead to Closed** | <5% | 5-10% | 10% |  |  |  |
    | **Sales Cycles (Enterprise)** | >12 months | 6-12 months | <6 months |  |  |  |
    | **Sales Cycles (SME)** | >6 months  | 3-6 months | <3 months |  |  |  |
    | **RO40 based on adj. EBITDA** | <40% | = 40% | >40% |  |  |  |
    | **Magic Number**   | <0.75x | 0.75-1.0x | >1.0x |  |  |  |

### Transaction Returns

- Indicative returns assumptions
- Is this investment able to return half the fund, the full fund etc?

### Core Thesis

- State core thesis

### Qualitative Milestones To Be Reached Ahead of Next Financing Round

| **Milestones** | **Description** |
| --- | --- |
| #1 |  |
| #2 |  |
| #3 |  |

---

### Key Positives

- 

### Key Challenges

- 

---

# **01. Team**

- Summary of team:
    - Key strengths
    - Key gaps/ weaknesses

| **Name** | **Position** | **Background / Experience** | **Met** | **References** |
| --- | --- | --- | --- | --- |
| Tbc | Tbc | Tbc | Tbc | Tbc |

# **02. Market Opportunity**

- Defined target market size (overall space + specific vertical/sectors/markets targeted) with growth rates
- Summary of secular trends
    - Supply, demand, regulatory dynamics etc (think Porter 5 forces here)

# **03. Competition**

- Key sources of competitive differentiation (why is this the right bet?)
    - E.g. product, team, regulation, distribution
- Competitive landscape table (divided into categories defined by deal/sector)

| **Category** | **Name** | **Founded** | **Stage** | **Last round + total raised to Date** | **HQ + Geos** | **Select Investors** | **Commentary** | **Met?** | **How competitive?** (1-5) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |

# **04. Product & Tech**

- What is the current product & scope
- Roadmap/milestones
- Differentiation (incl. defensibility/IP)
- Summary of any regulatory aspects
- Appropriateness of tech budget
- High level summary of diligence completed

# **05. Go-To-Market & Commercials**

- Precise definition of revenue model (today and evolution)
- Target customers & pipeline
- Distribution approach
    - E.g. sales cycle

# **06. Financials & Traction**

### 06 (1): P&L / KPIs

- Summary P&L output (management + MV case)
    - Including CF runway
- P&L and forecast credibility / commentary
- Other financial KPIs
- Traction (e.g. customers, geographies, development etc)

### 06 (2): Unit Economics

- Detailed unit economics overview (ideally waterfall chart)

# **07. Transaction & Returns**

- Valuation
    - Comps & precedent transactions
- Exit options
    - Commentary on exit route
    - Returns analysis
- Pre-mortem
- Co-investors
- Cap table

# **08. References**

- **Name, position**:
    - Feedback
- **Name, position**:
    - Feedback

# **09. Scorecard**

|  | Bucket 1 
Valuation <$15M post | Bucket 2
Valuation <$40M post | **Bucket 3
Valuation <$100M post** |
| --- | --- | --- | --- |
| **Team Attributes** | • More than one founder 
• If solo founder a) strong functional skill coverage in team and b) other proof points on wider management incentivisation
• Scale-up expertise in Founding Team ****
• Founders have a prior working relationship ****
• Founder are not subject-matter-experts / pure corporate or consultant CVs  | • Demonstrated ability to hire and retain top talent in key roles
• Demonstrated progress towards building a balanced management team
• Evidence of building up high performance/ high velocity team culture | • Founder is CEO
• Functionally complete management team (first and second line)
• Key personnel are appropriately incentivised |
| **Team Evaluation** | • 5 positive reference calls completed 
• If yellow reference, then 3+ green reference on same point
• Reference calls sourced from manager, subordinate, peer 
• In-person team evaluation scheduled  | • HR professional assessment (team profiles and composition) | • Relevant departed employee reference |
| **Revenue** | • ARR < $0.5M  | • ARR $0.5 - 2.0M | • ARR $2.0-7.0M+ |
| **Age** | <1 year since ideation  | • <3 years since ideation | • <5 years since ideation |
| **Capital Raised to Date** | <$1M  | • <$7M | • <$15M |
| **Capital Raising** | • $1–3M ticket size 
• Total round $2-3M 
• 15%+ ownership  | • $3–5M ticket size
• Total round $5-10M
• 10-15% ownership | • $7M ticket size
• Total round $10-20M7-10% ownership    |
| **Revenue Growth / Quality** | • N/M | • Revenue growth 150%+
• NRR 
• Customer concentration
• Implementation time
• Usage KPIs | • Net revenue growth 100%+
 |
| **Product** | • N/M |  |  |
| **GTM / Sales** | • At least one customer live  
• Have a pipeline developed and several conversations in progress  |  |  |
| **AI Attributes** | • Initial cost/revenue story
• Access to client data
• Model-agnostic
• Cloud setup
• Interaction-level agents | • Highly accurate extraction/structuring; business actionable
• Proprietary configuration/orchestration of underlying models
• On-prem (enterprise) + auditability / data governance trail (finished work)
• Owns full-stack with end-to-end task capability (finished work) 
 | • Highly accurate extraction/structuring; business actionable
• Proprietary configuration/orchestration of underlying models
• On-prem (enterprise) + auditability / data governance trail (finished work)
• Owns full-stack with end-to-end task capability (finished work)  |$$)
ON CONFLICT (key) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW();

-- Enable RLS (Row Level Security) - for now, allow all access
-- ALTER TABLE deal_memos ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY dm_rw ON deal_memos FOR ALL USING (true) WITH CHECK (true);

-- ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY templates_rw ON templates FOR ALL USING (true) WITH CHECK (true);






