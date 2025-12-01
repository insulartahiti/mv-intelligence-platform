/**
 * Centralized IFT (Integrated Fintech Taxonomy) Schema
 * 
 * SINGLE SOURCE OF TRUTH for taxonomy definitions.
 * Used by:
 * - /taxonomy page (UI tree rendering)
 * - taxonomy-classifier.ts (LLM search classification)
 * - intelligent_cleanup.ts (validation during maintenance)
 * 
 * STRICT POLICY: Only predefined codes allowed. No "discovered" categories.
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface TaxonomyNode {
    label: string;
    description?: string;
    children?: Record<string, TaxonomyNode>;
}

export interface TaxonomyTree {
    [key: string]: TaxonomyNode;
}

// =============================================================================
// CANONICAL TAXONOMY TREE
// =============================================================================

export const TAXONOMY_TREE: TaxonomyTree = {
    'IFT': {
        label: 'Investment Taxonomy',
        description: 'Root classification for all fintech investment entities',
        children: {
            'PAY': {
                label: 'Payments',
                description: 'Payment processing, infrastructure, and operations',
                children: {
                    'COM': {
                        label: 'Commercial',
                        description: 'Customer-facing payment services',
                        children: {
                            'GATEWAY': { label: 'Payment Gateway', description: 'Online payment processing (Stripe, Adyen, Checkout.com)' },
                            'AGGREGATOR': { label: 'Payment Aggregator', description: 'Aggregates multiple payment methods' },
                            'POS_ACCESS': { label: 'POS Access', description: 'Point of Sale integration' }
                        }
                    },
                    'INF': {
                        label: 'Infrastructure',
                        description: 'Backend payment systems',
                        children: {
                            'CLEARING': { label: 'Clearing', description: 'Transaction clearing and settlement' },
                            'EMONEY_ISSUER': { label: 'E-Money Issuer', description: 'Electronic money issuance' },
                            'MOBILE_MONEY': { label: 'Mobile Money', description: 'Mobile-based financial services' }
                        }
                    },
                    'OPSF': {
                        label: 'Operations & Finance',
                        description: 'Payment operations tools',
                        children: {
                            'MONEY_TRANSFER': { label: 'Money Transfer', description: 'Remittance, P2P transfers' },
                            'AP_AUTOMATION': { label: 'AP Automation', description: 'Accounts Payable automation' },
                            'AR_AUTOMATION': { label: 'AR Automation', description: 'Accounts Receivable automation' },
                            'SUPPLIER_FIN': { label: 'Supplier Finance', description: 'Supply chain financing' }
                        }
                    },
                    'SRR': {
                        label: 'Security & Risk',
                        description: 'Payment security solutions',
                        children: {
                            'FRAUD_STACK': { label: 'Fraud Stack', description: 'Payment fraud prevention' }
                        }
                    }
                }
            },
            'DBK': {
                label: 'Digital Banking',
                description: 'Neobanks and banking infrastructure',
                children: {
                    'RETAIL': {
                        label: 'Retail Banking',
                        description: 'Consumer digital banking',
                        children: {
                            'NEO_BANK': { label: 'Neo Bank', description: 'Digital-first retail banks (Monzo, Revolut, N26)' }
                        }
                    },
                    'MSME': {
                        label: 'MSME Banking',
                        description: 'Small business banking',
                        children: {
                            'NEO_BANK': { label: 'Neo Bank', description: 'Digital banks for SMBs (Mercury, Brex)' }
                        }
                    },
                    'BAAS': { label: 'Banking as a Service', description: 'White-label banking infrastructure (Unit, Treasury Prime)' }
                }
            },
            'LEN': {
                label: 'Lending',
                description: 'Credit and lending services',
                children: {
                    'BSL': {
                        label: 'Balance Sheet Lending',
                        description: 'Direct lending from own balance sheet',
                        children: {
                            'BUSINESS': { label: 'Business Lending', description: 'B2B loans' },
                            'CONSUMER': { label: 'Consumer Lending', description: 'Personal loans' },
                            'PROPERTY': { label: 'Mortgage & Property', description: 'Real estate financing' }
                        }
                    },
                    'P2P': {
                        label: 'Peer to Peer',
                        description: 'Marketplace lending',
                        children: {
                            'BUSINESS': { label: 'Business P2P', description: 'P2P business lending platforms' }
                        }
                    },
                    'CASHADV': {
                        label: 'Cash Advance',
                        description: 'Short-term financing',
                        children: {
                            'CUSTOMER': { label: 'BNPL / Customer', description: 'Buy Now Pay Later, consumer credit' },
                            'MERCHANT': { label: 'Merchant Cash Advance', description: 'Revenue-based merchant financing' }
                        }
                    },
                    'DEBTSEC': {
                        label: 'Debt Securities',
                        description: 'Invoice and receivables financing',
                        children: {
                            'INVOICE_TRADING': { label: 'Invoice Trading', description: 'Invoice factoring platforms' }
                        }
                    }
                }
            },
            'CAPR': {
                label: 'Capital Raising',
                description: 'Digital capital raising and crowdfunding',
                children: {
                    'INV_CF': {
                        label: 'Investment Crowdfunding',
                        description: 'Regulated crowdfunding platforms',
                        children: {
                            'EQUITY': { label: 'Equity Crowdfunding', description: 'Equity-based crowdfunding' },
                            'REAL_ESTATE': { label: 'Real Estate Crowdfunding', description: 'Property investment platforms' },
                            'RETAIL_BROKER': { label: 'Retail Broker', description: 'Retail investment brokerage' },
                            'INST_BROKER': { label: 'Institutional Broker', description: 'Institutional brokerage' }
                        }
                    },
                    'NONINV_CF': {
                        label: 'Non-Investment CF',
                        description: 'Non-equity crowdfunding',
                        children: {
                            'DONATION': { label: 'Donation', description: 'Donation-based crowdfunding' },
                            'REWARD': { label: 'Reward', description: 'Reward-based crowdfunding' }
                        }
                    }
                }
            },
            'WLT': {
                label: 'Wealth Management',
                description: 'Wealth tech and asset management',
                children: {
                    'FO': {
                        label: 'Front Office',
                        description: 'Client-facing wealth tools',
                        children: {
                            'CRM': { label: 'Wealth CRM', description: 'Client relationship management for wealth' },
                            'INVEST': { label: 'Investment Platforms', description: 'Robo-advisors, trading apps (Betterment, Wealthfront)' }
                        }
                    },
                    'MO': {
                        label: 'Middle Office',
                        description: 'Operations and compliance',
                        children: {
                            'COMPLIANCE': { label: 'Wealth Compliance', description: 'Regulatory compliance tools' }
                        }
                    },
                    'BO': {
                        label: 'Back Office',
                        description: 'Portfolio and asset operations',
                        children: {
                            'PMS': { label: 'Portfolio Management Systems', description: 'Investment portfolio software' }
                        }
                    }
                }
            },
            'CRYP': {
                label: 'Crypto & DeFi',
                description: 'Cryptocurrency and decentralized finance',
                children: {
                    'EXCH': {
                        label: 'Exchange',
                        description: 'Crypto trading venues',
                        children: {
                            'TRADE': {
                                label: 'Trading',
                                description: 'Crypto exchanges (Coinbase, Kraken)',
                                children: {
                                    'ORDERBOOK': { label: 'Orderbook Exchange', description: 'Central limit order book exchanges' }
                                }
                            }
                        }
                    },
                    'CUST': {
                        label: 'Custody',
                        description: 'Digital asset custody',
                        children: {
                            'INST': {
                                label: 'Institutional',
                                description: 'Institutional-grade custody',
                                children: {
                                    'THIRD_PARTY': { label: 'Third Party Custody', description: 'Qualified custodians' }
                                }
                            }
                        }
                    },
                    'STBL': {
                        label: 'Stablecoins',
                        description: 'Stable digital currencies',
                        children: {
                            'ISSUER': {
                                label: 'Issuer',
                                description: 'Stablecoin issuers',
                                children: {
                                    'FIAT_BACKED': { label: 'Fiat Backed', description: 'USD-backed stablecoins (Circle, Tether)' }
                                }
                            },
                            'INF': {
                                label: 'Infrastructure',
                                description: 'Stablecoin infrastructure',
                                children: {
                                    'ONOFF_RAMP': { label: 'On/Off Ramp', description: 'Fiat-crypto bridges (MoonPay, Ramp)' }
                                }
                            }
                        }
                    },
                    'CONS': {
                        label: 'Consensus & Networks',
                        description: 'Blockchain infrastructure',
                        children: {
                            'MINING': {
                                label: 'Mining',
                                description: 'Proof of Work operations',
                                children: {
                                    'HARDWARE_MFG': { label: 'Hardware Mfg', description: 'Mining hardware manufacturing' },
                                    'REMOTE_HOSTING': { label: 'Remote Hosting', description: 'Hosted mining services' },
                                    'CLOUD_MINING': { label: 'Cloud Mining', description: 'Cloud mining contracts' }
                                }
                            },
                            'STAKING': {
                                label: 'Staking',
                                description: 'Proof of Stake operations',
                                children: {
                                    'AS_A_SERVICE': { label: 'Staking as a Service', description: 'Validator node services' }
                                }
                            }
                        }
                    }
                }
            },
            'INS': {
                label: 'InsurTech',
                description: 'Insurance technology',
                children: {
                    'USAGE_BASED': { label: 'Usage Based Insurance', description: 'Pay-as-you-go insurance' },
                    'PARAMETRIC': { label: 'Parametric Insurance', description: 'Index-based payouts' },
                    'ON_DEMAND': { label: 'On-Demand Insurance', description: 'Instant coverage activation' },
                    'DIGITAL_BROKERS_AGENTS': { label: 'Digital Brokers', description: 'Online insurance distribution' },
                    'CLAIMS_RISK_MGMT': { label: 'Claims & Risk Mgmt', description: 'Claims processing and risk tools' }
                }
            },
            'RCI': {
                label: 'Risk, Compliance & Identity',
                description: 'RegTech, identity verification, and compliance',
                children: {
                    'ID': {
                        label: 'Identity',
                        description: 'Identity verification services',
                        children: {
                            'KYB': {
                                label: 'KYB',
                                description: 'Know Your Business',
                                children: {
                                    'BASIC_PROFILE': { label: 'Basic Profile', description: 'Company verification' },
                                    'UBO_DISCOVERY': { label: 'UBO Discovery', description: 'Ultimate beneficial owner identification' },
                                    'DOC_COLLECTION': { label: 'Doc Collection', description: 'Document verification' }
                                }
                            },
                            'KYC': { label: 'KYC', description: 'Know Your Customer verification' },
                            'FRAUD': {
                                label: 'Fraud',
                                description: 'Fraud prevention',
                                children: {
                                    'DEVICE_FP': { label: 'Device Fingerprinting', description: 'Device identification for fraud detection' }
                                }
                            }
                        }
                    },
                    'REG': {
                        label: 'Regulatory',
                        description: 'Compliance and regulatory tools',
                        children: {
                            'TMON': {
                                label: 'Transaction Monitoring',
                                description: 'AML transaction surveillance',
                                children: {
                                    'REALTIME': { label: 'Realtime Monitoring', description: 'Real-time AML screening' },
                                    'CASE_MGMT': { label: 'Case Management', description: 'Alert investigation workflows' }
                                }
                            },
                            'DYNAMIC_COMPLIANCE': { label: 'Dynamic Compliance', description: 'Automated compliance rules (RegTech)' },
                            'REPORTING': { label: 'Reporting', description: 'Regulatory reporting' },
                            'REPORTING_DASHBOARDS': { label: 'Reporting Dashboards', description: 'Compliance analytics' },
                            'PROFILE_DD': { label: 'Profile Due Diligence', description: 'Enhanced due diligence' },
                            'BLOCKCHAIN_FORENSICS': { label: 'Blockchain Forensics', description: 'Crypto compliance (Chainalysis, Elliptic)' },
                            'RISK_ANALYTICS': { label: 'Risk Analytics', description: 'Risk scoring and analytics' }
                        }
                    }
                }
            },
            'SAV': {
                label: 'Digital Savings',
                description: 'Digital savings and micro-savings platforms'
            },
            'OPS': {
                label: 'Finance Ops & Treasury',
                description: 'Treasury, payouts, reconciliation, and connectivity',
                children: {
                    'TREASURY': {
                        label: 'Treasury',
                        description: 'Corporate treasury management',
                        children: {
                            'CASH': { label: 'Cash Management', description: 'Cash position and forecasting' },
                            'FORECAST': { label: 'Forecasting', description: 'Cash flow forecasting' },
                            'VIRTUAL_ACCOUNTS': { label: 'Virtual Accounts', description: 'Virtual account management' }
                        }
                    },
                    'PAYOUTS': {
                        label: 'Payouts',
                        description: 'Disbursement services',
                        children: {
                            'MASS': { label: 'Mass Payouts', description: 'Bulk payment processing' },
                            'XB': { label: 'Cross-Border Payouts', description: 'International disbursements' }
                        }
                    },
                    'RECON': {
                        label: 'Reconciliation',
                        description: 'Financial reconciliation',
                        children: {
                            'AUTO': { label: 'Automated Recon', description: 'Automated reconciliation' },
                            'CASH_APP': { label: 'Cash Application', description: 'Remittance matching' }
                        }
                    },
                    'CONNECT': {
                        label: 'Connectivity',
                        description: 'Bank and ERP connectivity',
                        children: {
                            'H2H': { label: 'Host-to-Host', description: 'Direct bank connections' },
                            'SWIFT': { label: 'SWIFT Gateway', description: 'SWIFT network access' },
                            'ERP': { label: 'ERP Connectors', description: 'ERP integration' }
                        }
                    },
                    'DATA': {
                        label: 'Data & Identity',
                        description: 'Counterparty data services',
                        children: {
                            'KYB': {
                                label: 'KYB Registry',
                                description: 'Business data registries',
                                children: {
                                    'REGISTRY': { label: 'Registry', description: 'Company registries' }
                                }
                            },
                            'CPTY_RESOLUTION': { label: 'Counterparty Resolution', description: 'Entity matching' }
                        }
                    }
                }
            },
            'ENT': {
                label: 'Enterprise Tech',
                description: 'Technology for enterprise operations',
                children: {
                    'AI_ML_NLP': { label: 'AI/ML & NLP', description: 'Artificial Intelligence for finance' },
                    'API_MGMT': { label: 'API Management', description: 'API gateway and management' },
                    'CLOUD': { label: 'Cloud Infrastructure', description: 'Cloud computing services' },
                    'FIN_MGMT_BI': { label: 'Financial Management & BI', description: 'Business intelligence tools' },
                    'DIGITAL_ACCOUNTING': { label: 'Digital Accounting', description: 'Accounting software' },
                    'E_INVOICING': { label: 'E-Invoicing', description: 'Electronic invoicing' }
                }
            },
            'MKT': {
                label: 'Market Infrastructure',
                description: 'Capital markets and trading infrastructure',
                children: {
                    'REFDATA': {
                        label: 'Reference Data',
                        description: 'Market data services',
                        children: {
                            'MGMT': { label: 'Management', description: 'Reference data management' }
                        }
                    },
                    'SURV': {
                        label: 'Surveillance',
                        description: 'Market surveillance',
                        children: {
                            'TRADE': { label: 'Trade Surveillance', description: 'Trading surveillance' },
                            'COMMS': { label: 'Comms Surveillance', description: 'Communications monitoring' }
                        }
                    },
                    'COLLATERAL': { label: 'Collateral Management', description: 'Collateral optimization' },
                    'MARGIN': { label: 'Margin', description: 'Margin calculation and management' }
                }
            }
        }
    }
};

// =============================================================================
// DERIVED EXPORTS
// =============================================================================

/**
 * Recursively extracts all valid taxonomy codes from the tree.
 * Used for validation in cleanup scripts and API endpoints.
 */
function extractCodes(node: TaxonomyNode, prefix: string, codes: Set<string>): void {
    codes.add(prefix);
    if (node.children) {
        for (const [key, child] of Object.entries(node.children)) {
            extractCodes(child, `${prefix}.${key}`, codes);
        }
    }
}

const _validCodesSet = new Set<string>();
extractCodes(TAXONOMY_TREE['IFT'], 'IFT', _validCodesSet);

/**
 * Set of all valid taxonomy codes.
 * Use for validation: VALID_TAXONOMY_CODES.has(code)
 */
export const VALID_TAXONOMY_CODES: ReadonlySet<string> = _validCodesSet;

/**
 * Array of valid codes (for iteration).
 */
export const VALID_TAXONOMY_CODES_LIST: readonly string[] = Array.from(_validCodesSet).sort();

/**
 * Validates if a taxonomy code is in the canonical schema.
 */
export function isValidTaxonomyCode(code: string): boolean {
    return VALID_TAXONOMY_CODES.has(code);
}

/**
 * Returns the parent code for a given taxonomy code.
 * Example: 'IFT.PAY.COM.GATEWAY' -> 'IFT.PAY.COM'
 */
export function getParentCode(code: string): string | null {
    const parts = code.split('.');
    if (parts.length <= 1) return null;
    return parts.slice(0, -1).join('.');
}

/**
 * Compact schema string for LLM prompts.
 * Includes commonly used leaf codes with descriptions.
 */
export const TAXONOMY_PROMPT_SCHEMA = `
## IFT Taxonomy Codes (use ONLY these codes)

### IFT.PAY - Money & Payments
- IFT.PAY.COM.GATEWAY - Payment gateways, PSPs, checkout (Stripe, Adyen, Checkout.com)
- IFT.PAY.COM.AGGREGATOR - Payment aggregators
- IFT.PAY.COM.POS_ACCESS - Point of Sale
- IFT.PAY.INF.CLEARING - Settlement & clearing
- IFT.PAY.INF.EMONEY_ISSUER - E-money issuers
- IFT.PAY.INF.MOBILE_MONEY - Mobile money
- IFT.PAY.OPSF.MONEY_TRANSFER - Remittance, P2P transfers
- IFT.PAY.OPSF.AP_AUTOMATION - Accounts payable
- IFT.PAY.OPSF.AR_AUTOMATION - Accounts receivable
- IFT.PAY.OPSF.SUPPLIER_FIN - Supply chain finance
- IFT.PAY.SRR.FRAUD_STACK - Payment fraud prevention

### IFT.DBK - Digital Banking
- IFT.DBK.RETAIL.NEO_BANK - Consumer neobanks (Monzo, Revolut, N26)
- IFT.DBK.MSME.NEO_BANK - SMB neobanks (Mercury, Brex)
- IFT.DBK.BAAS - Banking-as-a-Service (Unit, Treasury Prime)

### IFT.LEN - Digital Lending
- IFT.LEN.BSL.BUSINESS - Balance sheet business lending
- IFT.LEN.BSL.CONSUMER - Consumer lending
- IFT.LEN.BSL.PROPERTY - Mortgage/property lending
- IFT.LEN.P2P.BUSINESS - P2P business lending
- IFT.LEN.CASHADV.CUSTOMER - BNPL, consumer credit
- IFT.LEN.CASHADV.MERCHANT - Merchant cash advance
- IFT.LEN.DEBTSEC.INVOICE_TRADING - Invoice trading/factoring

### IFT.WLT - Wealth Management
- IFT.WLT.FO.INVEST - Robo-advisors, investment platforms (Betterment, Wealthfront)
- IFT.WLT.FO.CRM - Wealth CRM
- IFT.WLT.MO.COMPLIANCE - Wealth compliance
- IFT.WLT.BO.PMS - Portfolio management systems

### IFT.CRYP - Crypto & DeFi
- IFT.CRYP.EXCH.TRADE - Crypto exchanges (Coinbase, Kraken)
- IFT.CRYP.CUST.INST.THIRD_PARTY - Institutional custody
- IFT.CRYP.STBL.ISSUER.FIAT_BACKED - Stablecoin issuers (Circle, Tether)
- IFT.CRYP.STBL.INF.ONOFF_RAMP - On/off ramps (MoonPay, Ramp)

### IFT.INS - InsurTech
- IFT.INS.USAGE_BASED - Usage-based insurance
- IFT.INS.PARAMETRIC - Parametric insurance
- IFT.INS.DIGITAL_BROKERS_AGENTS - Digital insurance brokers
- IFT.INS.CLAIMS_RISK_MGMT - Claims management

### IFT.RCI - Risk, Compliance & Identity
- IFT.RCI.ID.KYC - KYC verification
- IFT.RCI.ID.KYB.UBO_DISCOVERY - KYB/UBO discovery
- IFT.RCI.ID.FRAUD.DEVICE_FP - Fraud detection, device fingerprinting
- IFT.RCI.REG.DYNAMIC_COMPLIANCE - Compliance automation (regtech)
- IFT.RCI.REG.TMON.REALTIME - Transaction monitoring (AML)
- IFT.RCI.REG.BLOCKCHAIN_FORENSICS - Blockchain analytics (Chainalysis)
- IFT.RCI.REG.RISK_ANALYTICS - Risk analytics

### IFT.OPS - Finance Ops & Treasury
- IFT.OPS.TREASURY.CASH - Cash management
- IFT.OPS.TREASURY.VIRTUAL_ACCOUNTS - Virtual accounts
- IFT.OPS.PAYOUTS.XB - Cross-border payouts
- IFT.OPS.RECON.AUTO - Automated reconciliation
- IFT.OPS.DATA.KYB.REGISTRY - Business registries

### IFT.ENT - Enterprise Tech
- IFT.ENT.AI_ML_NLP - AI/ML for finance
- IFT.ENT.API_MGMT - API management
- IFT.ENT.CLOUD - Cloud infrastructure
- IFT.ENT.DIGITAL_ACCOUNTING - Digital accounting

### IFT.MKT - Market Infrastructure
- IFT.MKT.SURV.TRADE - Trade surveillance
- IFT.MKT.REFDATA.MGMT - Reference data management
- IFT.MKT.COLLATERAL - Collateral management

### IFT.CAPR - Capital Raising
- IFT.CAPR.INV_CF.EQUITY - Equity crowdfunding
- IFT.CAPR.INV_CF.REAL_ESTATE - Real estate crowdfunding
`;

/**
 * Blocklist of known garbage taxonomy segments.
 * Used to filter out invalid codes during display.
 */
export const INVALID_TAXONOMY_SEGMENTS = [
    'UNKNOWN', 'UNDEFINED', 'UNK', 'UNCLASSIFIED', 
    'NULL', 'NAN', 'NONE', 'N/A', 'NOT_APPLICABLE', 
    'NOT CLASSIFIED', 'NON_FINTECH', 'UNDETERMINED', 
    'UNMAPPED', 'OUT_OF_SCOPE', 'NOT_CLASSIFIED'
];

/**
 * Checks if a taxonomy code contains any invalid/garbage segments.
 */
export function hasInvalidSegment(code: string): boolean {
    const upper = code.toUpperCase();
    return INVALID_TAXONOMY_SEGMENTS.some(seg => upper.includes(seg));
}

