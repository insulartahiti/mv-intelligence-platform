
-- Company snapshots for dashboard
create table if not exists company_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  as_of date not null default current_date,
  metrics jsonb default '{}',         -- e.g. {"ARR":..., "MRR":..., "NRR":..., "Churn":...}
  news_30d int default 0,
  actions_open int default 0,
  updated_at timestamptz default now()
);
create index if not exists cs_org_company_idx on company_snapshots(org_id, company_id, as_of);

alter table company_snapshots enable row level security;
create policy cs_rw on company_snapshots for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);

-- Deal memos: markdown drafts tied to a company and optional opportunity id
create table if not exists deal_memos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  opportunity_id text, -- from Affinity or cache
  title text,
  markdown text,
  last_drafted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists dm_org_company_idx on deal_memos(org_id, company_id);

alter table deal_memos enable row level security;
create policy dm_rw on deal_memos for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);

-- Templates table to store memo template
create table if not exists templates (
  key text primary key,
  content text not null,
  updated_at timestamptz default now()
);
insert into templates(key, content) values
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
- **AUM**
    
    
    | **Metric** | **Benchmark POOR** | **Benchmark GOOD** | **Benchmark GREAT** | **Value [Company] [time period]**   | **Outlook [Company] [time period]** | **Commentary** |
    | --- | --- | --- | --- | --- | --- | --- |
    | **Assets Under Management (AUM)** | <$500M | $500M–$5B | $5B+ |  |  |  |
    | **AUM Growth Rate YoY (%)** | <100% | 100-150% | >150%  |  |  |  |
    | **AUM per employee**  | <$10M | $10-50M | >$50M |  |  |  |
    | **Annual client churn rate**  | >10%  | 5-10% | <5% |  |  |  |
    | **Gross Margin** | <50% | 50-70% | >70% |  |  |  |
    | **Servicing Cost per $1M AUM** | >$10k | $5-$10k | <$5k |  |  |  |
    | **Revenue per $1M AUM** | <$5k (0.5%) | $5-20k (0.5-2%) | >$20k (2%) |  |  |  |
    | **Net Revenue Retention (NRR)** | <90% | 90%–110% | >110% |  |  |  |
    | **CAC** | >$50k | $25-50k | <$25k |  |  |  |
    | **LTV of AUM (LTV: AUM)** | < 2x CAC | 2-5x CAC | > 5x CAC |  |  |  |
- **Transactions**
    
    
    | **Metric** | **Benchmark POOR** | **Benchmark GOOD** | **Benchmark GREAT** | **Value [Company] [time period]**   | **Outlook [Company] [time period]** | **Commentary** |
    | --- | --- | --- | --- | --- | --- | --- |
    | **Total Monthly Transaction Volume (TTV)** | <$20M | $20M–$150M | $150M+ |  |  |  |
    | **Take Rate (%)** | <0.5% | 0.5%–2% | >2% |  |  |  |
    | **Net Revenue Retention (NRR)** | <90% | 90%–110% | >110% |  |  |  |
    | **Customer Acquisition Cost (CAC) Payback (Months)** | >24 months | 12–24 months | <12 months |  |  |  |
    | **Churn MoM** | >5% | 1.5-5.0% | <1.5% |  |  |  |
    | **Sales Cycles (Enterprise)**  | >12 months | 6-12 months | <6 months |  |  |  |
    | **Sales Cycles (SME)** | >6 months  | 3-6 months | <3 months |  |  |  |
- **Marketplaces / Platforms**
    
    
    | **Metric** | **Benchmark POOR** | **Benchmark GOOD** | **Benchmark GREAT** | **Value [Company] [time period]**   | **Outlook [Company] [time period]** | **Commentary** |
    | --- | --- | --- | --- | --- | --- | --- |
    | **Gross Merchandise Volume (GMV)** | 10M | $10M–$50M | $100M+ |  |  |  |
    | **Take Rate (%)** | <5% | 5%–15% | 15%+ |  |  |  |
    | **Liquidity Rate (Buyer-Seller Matching Time)** | >30 days | 7–30 days | <7 days |  |  |  |
    | **Repeat Purchase Rate (%)** | <20% | 20%–50% | >50% |  |  |  |
    | **CAC Payback Period (Months)** | >24 months | 12–24 months | <12 months |  |  |  |
    | **Buyer-to-Seller Ratio** | <1:1 | 1:1 to 5:1 | >10:1 |  |  |  |
    | **Net Revenue Retention (NRR) for Sellers** | <90% | 90%–110% | >110% |  |  |  |
- **Consumer**
    
    
    | **Metric** | **Benchmark POOR** | **Benchmark GOOD** | **Benchmark GREAT** | **Value [Company] [time period]**   | **Outlook [Company] [time period]** | **Commentary** |
    | --- | --- | --- | --- | --- | --- | --- |
    | **Monthly Active Users (MAU)** | <100K | 100K–1M | >1M |  |  |  |
    | **Daily Active Users (DAU) / MAU Ratio** | <10% | 10%–30% | >30% |  |  |  |
    | **Monthly User Growth Rate (%)** | <10%  | 10%–20%  | >20%  |  |  |  |
    | **CAC Payback Period (Months)** | >24 months | 12–24 months | <12 months |  |  |  |
    | **Customer Lifetime Value (LTV)** | <CAC | 3x CAC | 5x+ CAC |  |  |  |
    | **Churn Rate MoM (%)** | >7% monthly | 3%–7% monthly | <3% monthly |  |  |  |
    | **Conversion Rate (%) (Visitors to Paying Users)** | <1% | 1%–5% | >5% |  |  |  |
    | **Average Revenue Per User (ARPU)** | <$5 per month | $5–$20 per month | >$20 per month |  |  |  |
    | **Gross Margin (%)** | <40% | 40%–70% | >70% |  |  |  |
    | **Organic vs. Paid User Acquisition (%)** | <20% organic | 20%–50% organic | >50% organic  |  |  |  |

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
- *>Toggle “Appendix”*

# **02. Market Opportunity**

- Defined target market size (overall space + specific vertical/sectors/markets targeted) with growth rates
- Summary of secular trends
    - Supply, demand, regulatory dynamics etc (think Porter 5 forces here)
- *>Toggle “Appendix”*

# **03. Competition**

- Key sources of competitive differentiation (why is this the right bet?)
    - E.g. product, team, regulation, distribution
- Competitive landscape table (divided into categories defined by deal/sector, e.g. Constafor FIM pg. 28/29)

| **Category** | **Name** | **Founded** | **Stage** | **Last round + total raised to Date** | **HQ + Geos** | **Select Investors** | **Commentary** | **Met?** | **How competitive?** (1-5) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |
- *>Toggle “Appendix”*

# **04. Product & Tech**

- What is the current product & scope
- Roadmap/milestones
- Differentiation (incl. defensibility/IP)
- Summary of any regulatory aspects
- Appropriateness of tech budget
- High level summary of diligence completed
- *>Toggle “Appendix”*

# **05. Go-To-Market & Commercials**

- Precise definition of revenue model (today and evolution)
- Target customers & pipeline
- Distribution approach
    - E.g. sales cycle
- *>Toggle “Appendix”*

# **06. Financials & Traction**

### 06 (1): P&L / KPIs

- Summary P&L output (management + MV case)
    - Including CF runway
- P&L and forecast credibility / commentary
- Other financial KPIs
- Traction (e.g. customers, geographies, development etc)

### 06 (2): Unit Economics

- Detailed unit economics overview (ideally waterfall chart)
- *>Toggle “Appendix”*

# **07. Transaction & Returns**

- Valuation
    - Comps & precedent transactions
- Exit options
    - Commentary on exit route
    - Returns analysis
- Pre-mortem
- Co-investors
- Cap table
- *>Toggle “Appendix”*

# **08. References**

- **Name, position**:
    - Feedback
- **Name, position**:
    - Feedback

# **09. Scorecard**

<aside>
💡

Within identified bucket, please add ticks (✅) to the bullets below.

</aside>

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
on conflict (key) do update set content = excluded.content, updated_at = now();

-- Watchlist of companies (org-scoped)
create table if not exists company_watchlist (
  org_id uuid not null references orgs(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  added_at timestamptz default now(),
  primary key (org_id, company_id)
);

alter table company_watchlist enable row level security;
create policy cw_rw on company_watchlist for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);
