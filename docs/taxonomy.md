# Integrated Fintech Taxonomy
**Version:** 2025-10-13  
**Purpose:** One canonical hierarchy for labeling, KG relations, and embeddings.

## Design
- **Code shape:** `IFT.<T0>.<T1>.<T2>[.<T3>]` (upper-snake segments; stable keys)
- **Single backbone:** CCAF categories are canonical nodes; enterprise, Wheel, Stack, and WM are **dimensions** on these nodes.
- **Dimensions (stored as properties on each node):**
  - `wheel_l0/l1/l2` (Payments Wheel), `stablecoin_layer` (Issuer/Infra/App),
    `wm_area` (FO/MO/BO + sub), `standards` (ISO 20022/BIAN/FDX/OBIE/FATF), `primary_user` (Retail/MSME/Institutional/Treasury/Compliance)
- **No duplicates:** If two labels are synonyms, keep one node with `aliases: [..]`.

---

## T0: Money & Payments (`IFT.PAY`)
### T1: Commerce Enablement (`COM`)
- `IFT.PAY.COM.GATEWAY` — Payment gateways *(aliases: checkout, PSP gateway)*
- `IFT.PAY.COM.AGGREGATOR` — Payment aggregators
- `IFT.PAY.COM.API_HUB` — API hubs for payments
- `IFT.PAY.COM.POS_ACCESS` — Points of access (PoS/mPoS/Online PoS)
  - **CCAF crosswalk:** `FT.PAY.BE.GATEWAY`, `FT.PAY.BE.AGGREGATOR`, `FT.PAY.BE.API_HUB`, `FT.PAY.PS.POS_POINTS_OF_ACCESS`
  - **wheel_l0:** Commerce Enablement

### T1: Rails & Infrastructure (`INF`)
- `IFT.PAY.INF.CLEARING` — Settlement & clearing services
- `IFT.PAY.INF.EMONEY_ISSUER` — eMoney issuers
- `IFT.PAY.INF.MOBILE_MONEY` — Mobile money
- `IFT.PAY.INF.ACQUIRING` — Acquiring service providers
  - **CCAF crosswalk:** `FT.PAY.BE.CLEARING`, `FT.PAY.PS.EMONEY_ISSUER`, `FT.PAY.PS.MOBILE_MONEY`, `FT.PAY.PS.ACQUIRING`
  - **wheel_l0:** Rails/Infrastructure

### T1: Payment Ops & Financing (`OPSF`)
- `IFT.PAY.OPSF.MONEY_TRANSFER` — Money transfer (P2P/P2B/B2P/B2B)
- `IFT.PAY.OPSF.BULK_PAYMENTS` — Bulk payments
- `IFT.PAY.OPSF.TOPUPS_REFILLS` — Top-ups & refills
- `IFT.PAY.OPSF.AP_AUTOMATION` — Accounts payable automation
- `IFT.PAY.OPSF.AR_AUTOMATION` — Accounts receivable automation
- `IFT.PAY.OPSF.SUPPLIER_FIN` — Supplier financing (SCF/dynamic discounting)
- `IFT.PAY.OPSF.CASH_APP` — Cash application & reconciliation
  - **CCAF crosswalk:** `FT.PAY.PS.MONEY_TRANSFER`, `FT.PAY.PS.BULK_PAYMENTS`, `FT.PAY.PS.TOPUPS_REFILLS`
  - **enterprise enrichment:** AP/AR/SCF/Cash-app
  - **wheel_l0:** Payment Operations & Financing

### T1: Security, Risk & Regulatory (`SRR`)
- `IFT.PAY.SRR.SANCTIONS_SCREEN` — Real-time sanctions screening
- `IFT.PAY.SRR.FRAUD_STACK` — Device FP, behavioral bio, bot mitigation, mule detection
- `IFT.PAY.SRR.REPORTING` — Regulatory reporting & dashboards
  - **CCAF crosswalk:** `FT.REG.*`, `FT.IDF.FRAUD_RISK`
  - **wheel_l0:** Security, Risk & Regulatory

---

## T0: Digital Lending (`IFT.LEN`)
### T1: Balance Sheet Lending (`BSL`)
- `IFT.LEN.BSL.BUSINESS`
- `IFT.LEN.BSL.PROPERTY`
- `IFT.LEN.BSL.CONSUMER`

### T1: Marketplace/P2P (`P2P`)
- `IFT.LEN.P2P.BUSINESS`
- `IFT.LEN.P2P.PROPERTY`
- `IFT.LEN.P2P.CONSUMER`

### T1: Debt-based Securities (`DEBTSEC`)
- `IFT.LEN.DEBTSEC.DEBTSEC`
- `IFT.LEN.DEBTSEC.MINIBOND`
- `IFT.LEN.DEBTSEC.INVOICE_TRADING`

### T1: Other Lending
- `IFT.LEN.MICROFIN.MICROFIN` — Crowd-led microfinance
- `IFT.LEN.CASHADV.CUSTOMER` — Customer cash-advance (incl. BNPL/store credit)
- `IFT.LEN.CASHADV.MERCHANT` — Merchant cash-advance

### T1: Commercial Credit Ops (`WF`)
- `IFT.LEN.WF.LOS` — Origination (commercial)
- `IFT.LEN.WF.UNDERWRITING` — Policy rules, scorecards, cash-flow models
- `IFT.LEN.WF.PRICING_LIMITS` — Risk-based pricing & limits
- `IFT.LEN.WF.COLLATERAL_MGMT`
- `IFT.LEN.WF.COVENANT_MON`
- `IFT.LEN.WF.SERV_B2B`
- `IFT.LEN.WF.COLLECT_B2B`

---

## T0: Digital Capital Raising (`IFT.CAPR`)
- `IFT.CAPR.INV_CF.EQUITY`
- `IFT.CAPR.INV_CF.REV_PROFIT_SHARE`
- `IFT.CAPR.INV_CF.REAL_ESTATE`
- `IFT.CAPR.INV_CF.COMMUNITY_SHARES`
- `IFT.CAPR.INV_CF.RETAIL_BROKER`
- `IFT.CAPR.INV_CF.INST_BROKER`
- `IFT.CAPR.NONINV_CF.DONATION`
- `IFT.CAPR.NONINV_CF.REWARD`
- `IFT.CAPR.NONINV_CF.TOKEN_HOST`

---

## T0: Digital Banks (`IFT.DBK`)
- `IFT.DBK.RETAIL.NEO_BANK`
- `IFT.DBK.RETAIL.MARKETPLACE`
- `IFT.DBK.MSME.NEO_BANK`
- `IFT.DBK.MSME.MARKETPLACE`
- `IFT.DBK.BAAS` — Banking-as-a-Service
- `IFT.DBK.AGENT_BANKING` — Agent cash-in/out

---

## T0: Digital Savings (`IFT.SAV`)
- `IFT.SAV.MMFUND`
- `IFT.SAV.MICRO_SAVE`
- `IFT.SAV.COLLECTIVE_POOL`
- `IFT.SAV.SAVINGS_AS_A_SERVICE`

---

## T0: Cryptoassets & Tokenization (`IFT.CRYP`)
### T1: Exchanges & Trading (`EXCH`)
- `IFT.CRYP.EXCH.TRADE.ORDERBOOK`
- `IFT.CRYP.EXCH.TRADE.DEX_RELAYER`
- `IFT.CRYP.EXCH.TRADE.OTC_SDP`
- `IFT.CRYP.EXCH.TRADE.BOTS`
- `IFT.CRYP.EXCH.TRADE.HFT`
- `IFT.CRYP.EXCH.TRADE.ADV_SERV`
- `IFT.CRYP.BROKER.RETAIL`
- `IFT.CRYP.BROKER.INST`
- `IFT.CRYP.AGG.AGGREGATION`
- `IFT.CRYP.OFTP.BTM`
- `IFT.CRYP.OFTP.P2P_MARKET`
- `IFT.CRYP.OFTP.CLEAR`

### T1: Digital Custody & Wallets (`CUST`)
- `IFT.CRYP.CUST.INST.THIRD_PARTY`
- `IFT.CRYP.CUST.INST.CO_MANAGED`
- `IFT.CRYP.CUST.RET.HARD_WALLET`
- `IFT.CRYP.CUST.RET.UNHOSTED_WALLET`
- `IFT.CRYP.CUST.RET.HOSTED_WALLET`
- `IFT.CRYP.CUST.RET.EMONEY_WALLET`
- `IFT.CRYP.CUST.KEY_MGMT`

### T1: Stablecoins (`STBL`)  *(integrated “Stablecoin Stack” as L2)*
**Layer: Issuer**
- `IFT.CRYP.STBL.ISSUER.FIAT_BACKED` *(stablecoin issuance — asset-backed)*
- `IFT.CRYP.STBL.ISSUER.ALGORITHMIC`
- `IFT.CRYP.STBL.ISSUER.DEPOSIT_TOKEN`

**Layer: Infrastructure**
- `IFT.CRYP.STBL.INF.ONOFF_RAMP`
- `IFT.CRYP.STBL.INF.TREASURY_API`
- `IFT.CRYP.STBL.INF.CUSTODY`
- `IFT.CRYP.STBL.INF.COMPLIANCE`
- `IFT.CRYP.STBL.INF.NETWORK`

**Layer: Applications**
- `IFT.CRYP.STBL.APP.XB_PAY` — Cross-border/settlement
- `IFT.CRYP.STBL.APP.TREASURY_FX`
- `IFT.CRYP.STBL.APP.CAPMKT_SETTLE`
- `IFT.CRYP.STBL.APP.LEND_CREDIT`
- `IFT.CRYP.STBL.APP.INSURANCE`
- `IFT.CRYP.STBL.APP.WEALTH`

*(Each node carries `stablecoin_layer: Issuer|Infrastructure|Applications` and optional `wheel_l0` if relevant.)*

---

## T0: Wealth & Asset Management (`IFT.WLT`)
### Front Office (`FO`)
- `IFT.WLT.FO.CRM` (with sub: ENGAGE, PROFILE, LIFECYCLE, CONTENT, DASHBOARD, REPORT, DOCS)
- `IFT.WLT.FO.ACCESS` (ADV, CHAT, API, IDDOC)
- `IFT.WLT.FO.INVEST` (ROBO, PROFILE, ENGINE, ALLOC)

### Middle Office (`MO`)
- `IFT.WLT.MO.COMPLIANCE` (SUIT, REPORT, TRADE, CROSSBORDER)
- `IFT.WLT.MO.SECURITY` (CYBER, FRAUD, NET)
- `IFT.WLT.MO.DATA` (REF, AGG, ANALYTICS, WAREHOUSE)
- `IFT.WLT.MO.RISK` (MEASURE, MODEL, CPTY)
- `IFT.WLT.MO.ENG` (APP, PRODUCT)
- `IFT.WLT.MO.BPM` (WORKFLOW, BPO)
- `IFT.WLT.MO.CLIENT` (PORTAL, PAR, OMS, RESEARCH, TRADING)
- `IFT.WLT.MO.BANKING` (DEPOSITS, LENDING, PAYMENTS, CASH)
- `IFT.WLT.MO.ONBOARD` (DIGITAL, IDV, KYC, SUIT)
- `IFT.WLT.MO.MARKET_SVCS` (AGENCY, IDENTITY, DATA, FUNDSDATA, MARKETDATA, PRICING)

### Back Office (`BO`)
- `IFT.WLT.BO.TRUST` (PROCESS, ACCOUNT, ADMIN, DLT, LENDING)
- `IFT.WLT.BO.PMS` (MODEL_ALLOC, PERF, ANALYSIS, RESEARCH_MKT, MODEL_MGMT, OMS)
- `IFT.WLT.BO.PLANNING` (FP, CASHFLOW, TAX, OVERLAY, BEHAV)
- `IFT.WLT.BO.SERVICING` (CORP_ACT, CUSTODY, TAX, FUND_ADMIN, SETTLE)
- `IFT.WLT.BO.INFRA` (DC)
- `IFT.WLT.BO.BI_PM` (ADVISOR, CLIENT)
- `IFT.WLT.BO.MO_OPS` (CASH_REC, EXCEPT, CALL)
- `IFT.WLT.BO.FIN_ACC` (GL, BILLING, COMMISSION)
- `IFT.WLT.BO.DOCS` (MGMT, VAULT)
- `IFT.WLT.BO.DISTRIB` (MKTG, MKTPL)
- `IFT.WLT.BO.PRACTICE` (RD_SUPPORT, SELECTION)
- `IFT.WLT.BO.ALTS` (PROCESS)

*(WM nodes include `wm_area: FO|MO|BO` and map to CCAF WealthTech, RegTech, Identity, Payments, etc.)*

---

## T0: InsurTech (`IFT.INS`)
- `IFT.INS.USAGE_BASED`
- `IFT.INS.PARAMETRIC`
- `IFT.INS.ON_DEMAND`
- `IFT.INS.P2P`
- `IFT.INS.TSP`
- `IFT.INS.DIGITAL_BROKERS_AGENTS`
- `IFT.INS.COMPARISON_PORTAL`
- `IFT.INS.CUSTOMER_MGMT`
- `IFT.INS.CLAIMS_RISK_MGMT`
- `IFT.INS.IOT_TELEMATICS`

---

## T0: Risk, Compliance & Digital Identity (`IFT.RCI`)
### Digital Identity (`ID`)
- `IFT.RCI.ID.SECURITY_BIOMETRICS`
- `IFT.RCI.ID.KYC`
- `IFT.RCI.ID.FRAUD_RISK`
- **Enterprise KYB & Entity Risk**
  - `IFT.RCI.ID.KYB.BASIC_PROFILE`
  - `IFT.RCI.ID.KYB.UBO_DISCOVERY`
  - `IFT.RCI.ID.KYB.DOC_COLLECTION`
- **Sanctions & Adverse Media**
  - `IFT.RCI.ID.SANCTIONS.SCREENING`
  - `IFT.RCI.ID.SANCTIONS.PEP`
  - `IFT.RCI.ID.SANCTIONS.ADVERSE_MEDIA`
- **Fraud Stack**
  - `IFT.RCI.ID.FRAUD.DEVICE_FP`
  - `IFT.RCI.ID.FRAUD.BEHAV_BIO`
  - `IFT.RCI.ID.FRAUD.BOT_MIT`
  - `IFT.RCI.ID.FRAUD.MULE_DET`
  - `IFT.RCI.ID.CHARGEBACKS`
- **Travel Rule (VASPs)**
  - `IFT.RCI.ID.TRAVEL_RULE`

### RegTech (`REG`)
- `IFT.RCI.REG.PROFILE_DD`
- `IFT.RCI.REG.BLOCKCHAIN_FORENSICS`
- `IFT.RCI.REG.RISK_ANALYTICS`
- `IFT.RCI.REG.DYNAMIC_COMPLIANCE`
- `IFT.RCI.REG.REPORTING`
- `IFT.RCI.REG.REPORTING_DASHBOARDS`
- `IFT.RCI.REG.MARKET_MONITOR`
- **AML/Surveillance**
  - `IFT.RCI.REG.TMON.REALTIME`
  - `IFT.RCI.REG.TMON.CASE_MGMT`
- **Trade/Tax Reporting**
  - `IFT.RCI.REG.REPORT.TRADE`
  - `IFT.RCI.REG.REPORT.TAX`
- **Alternative Credit Analytics**
  - `IFT.RCI.REG.ALT_CRED.PSYCHOMETRIC`
  - `IFT.RCI.REG.ALT_CRED.SOCIOMETRIC`
  - `IFT.RCI.REG.ALT_CRED.BIOMETRIC`
  - `IFT.RCI.REG.ALT_CRED.ALT_RATING_AGENCY`
  - `IFT.RCI.REG.ALT_CRED.CREDIT_SCORING`

---

## T0: Finance Ops, Treasury & Connectivity (`IFT.OPS`)
- `IFT.OPS.TREASURY.CASH`
- `IFT.OPS.TREASURY.FORECAST`
- `IFT.OPS.TREASURY.VIRTUAL_ACCOUNTS`
- `IFT.OPS.PAYOUTS.MASS`
- `IFT.OPS.PAYOUTS.XB`
- `IFT.OPS.RECON.AUTO`
- `IFT.OPS.RECON.CASH_APP`
- `IFT.OPS.CONNECT.H2H`
- `IFT.OPS.SWIFT.GW`
- `IFT.OPS.ERP.CONNECTORS`
- `IFT.OPS.DATA.KYB.REGISTRY`
- `IFT.OPS.DATA.KYB.UBO_GRAPH`
- `IFT.OPS.DATA.CPTY_RESOLUTION`
- `IFT.OPS.DATA.PAY_REF_ENRICH`
- `IFT.OPS.DATA.MERCHANT_ID`
- `IFT.OPS.DATA.BANK_DIRECTORY`
- `IFT.OPS.DATA.CASHFLOW_B2B`
- `IFT.OPS.DATA.INVOICE_INGEST`
- `IFT.OPS.DATA.CONTRACT_EXTRACT`
- `IFT.OPS.SEC.KMS`
- `IFT.OPS.SEC.TOKEN_VAULT`
- `IFT.OPS.SEC.API_SECURITY`

*(These nodes are the earlier “enterprise layer,” now integrated under OPS.)*

---

## T0: Tech for Enterprise (`IFT.ENT`)
- `IFT.ENT.API_MGMT`
- `IFT.ENT.CLOUD`
- `IFT.ENT.AI_ML_NLP`
- `IFT.ENT.ENTERPRISE_BLOCKCHAIN`
- `IFT.ENT.FIN_MGMT_BI`
- `IFT.ENT.DIGITAL_ACCOUNTING`
- `IFT.ENT.E_INVOICING`

---

## T0: Market Infrastructure & Capital Markets (`IFT.MKT`)
- `IFT.MKT.KYC.KYB_INST`
- `IFT.MKT.SURV.TRADE`
- `IFT.MKT.SURV.COMMS`
- `IFT.MKT.REFDATA.MGMT`
- `IFT.MKT.COLLATERAL`
- `IFT.MKT.MARGIN`

---

## T0: Consensus & Networks (`IFT.CONS`)
### Mining & Operations
- `IFT.CONS.MINING.HARDWARE_MFG`
- `IFT.CONS.MINING.REMOTE_HOSTING`
- `IFT.CONS.MINING.CLOUD_MINING`
- `IFT.CONS.MINING.HASHRATE_BROKER`
- `IFT.CONS.MINING.PROP_HASHING`
- `IFT.CONS.MINING.POOL_OPERATION`
- `IFT.CONS.MINING.EQUIP_PROC_FIN`
- `IFT.CONS.MINING.FIRMWARE_SOFTDEV`

### Staking
- `IFT.CONS.STAKING.AS_A_SERVICE`

---

## Standards & Identifiers (attach as node properties where relevant)
- **ISO 20022:** `pain.*`, `pacs.*`, `camt.*`, securities (`sese`, `setr`, `semt`, `seev`), `colr.*`
- **BIAN:** service domains (Treasury, Payments, Lending, Compliance)
- **Open Banking / FDX:** API endpoints and data objects
- **FATF Rec. 16:** Travel Rule
- **Identifiers:** **LEI** (org), **ISIN** (instrument), **MIC** (venue)

---

## KG Relations
- `offers_service` (Organization → Category)
- `uses_standard` (Org/API → Standard)
- `regulated_by`, `licensed_for` (Org → Regulator/License)
- `operates_on_rail` (Org → PaymentRail)
- `has_identifier` (Entity → Identifier)
- `integrates_with` (Org ↔ Org)
- `supports_api` (Category → API Capability)
- Dimensions on nodes: `wheel_l0/l1/l2`, `stablecoin_layer`, `wm_area`, `standards`, `primary_user`, `aliases`

---

## Governance (anti-redundancy)
1) **One node per concept;** store synonyms in `aliases`.  
2) **Wheel/Stack/WM** are **dimensions**, not separate hierarchies.  
3) **Stablecoins** live under `IFT.CRYP.STBL.*` only; do not duplicate in Payments.  
4) **Jurisdiction/licensing** are org attributes, not categories.  
5) **Versioning:** changelog with `added|changed|merged|deprecated` and lossless crosswalks.

---

## Embedding payload template (per node)
```md
# <code> <name>
**Definition.** <one sentence>
**Aliases.** <comma-separated>
**Dimensions.** wheel_l0=<...>; stablecoin_layer=<...>; wm_area=<...>; primary_user=<...>
**Standards.** ISO20022: <...>; BIAN: <...>; OBIE/FDX: <...>; FATF: <...>
**Examples.** <2–5 representative companies/products>
**Notes.** Disambiguation and false-positive traps