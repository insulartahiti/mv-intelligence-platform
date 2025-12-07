/**
 * Legal Document Analysis Types
 * 
 * TypeScript interfaces for structured legal document analysis output.
 * Covers term sheets, SPAs, SHAs, SAFEs, CLAs, and other investor documentation.
 */

// =============================================================================
// ENUMS & CONSTANTS
// =============================================================================

export type Jurisdiction = 'US' | 'UK' | 'Continental Europe' | 'Unknown';

export type InstrumentType = 
  | 'US_PRICED_EQUITY'
  | 'US_SAFE'
  | 'US_CONVERTIBLE_NOTE'
  | 'UK_EQUITY_BVCA_STYLE'
  | 'UK_EU_CLA'
  | 'EUROPEAN_PRICED_EQUITY'
  | 'OTHER';

export type Flag = 'GREEN' | 'AMBER' | 'RED';

export type AntiDilutionType = 
  | 'broad_based_weighted_average'
  | 'narrow_based_weighted_average'
  | 'full_ratchet'
  | 'none';

export type LiquidationPreferenceType = 'participating' | 'non_participating';

// =============================================================================
// EXECUTIVE SUMMARY
// =============================================================================

export interface ExecutiveSummaryPoint {
  point: string;
  flag: Flag;
  category: 'economics' | 'control' | 'governance' | 'legal' | 'other';
}

// =============================================================================
// TRANSACTION SNAPSHOT
// =============================================================================

export interface TransactionSnapshot {
  round_type: string;
  security_type: string;
  pre_money_valuation?: number;
  pre_money_valuation_currency?: string;
  pre_money_assumptions?: string;
  post_money_valuation?: number;
  post_money_valuation_currency?: string;
  round_size_total?: number;
  round_size_primary?: number;
  round_size_secondary?: number;
  esop_pool_size_percent?: number;
  esop_pool_treatment?: 'pre_money' | 'post_money';
  price_per_share?: number;
  our_check_size?: number;
  our_ownership_at_close_percent?: number;
  our_ownership_pro_forma_percent?: number;
  structural_features?: string[];
  source_locations?: SourceLocation[];
}

// =============================================================================
// ECONOMICS & DOWNSIDE PROTECTION
// =============================================================================

export interface LiquidationPreference {
  multiple: number;
  type: LiquidationPreferenceType;
  participation_cap?: number;
  seniority: 'senior' | 'pari_passu' | 'junior';
  carve_outs?: string[];
  pre_conversion_treatment?: string; // For SAFEs/CLAs
  flag: Flag;
  rationale: string;
  source_locations?: SourceLocation[];
}

export interface AntiDilution {
  type: AntiDilutionType;
  trigger_events?: string[];
  exclusions?: string[];
  flag: Flag;
  rationale: string;
  source_locations?: SourceLocation[];
}

export interface Dividends {
  rate_percent?: number;
  cumulative: boolean;
  payment_type: 'cash' | 'pik' | 'both' | 'none';
  priority?: string;
  hidden_return_notes?: string;
  flag: Flag;
  rationale: string;
  source_locations?: SourceLocation[];
}

export interface RedemptionRights {
  who_can_trigger?: string;
  timing?: string;
  price_formula?: string;
  schedule?: string;
  maturity_notes?: string; // For notes/CLAs
  flag: Flag;
  rationale: string;
  source_locations?: SourceLocation[];
}

export interface PayToPlay {
  exists: boolean;
  consequences?: string[];
  soft_or_hard?: 'soft' | 'hard';
  flag: Flag;
  rationale: string;
  source_locations?: SourceLocation[];
}

export interface WarrantsExtras {
  warrants?: {
    coverage_percent?: number;
    strike_price?: number;
    expiry?: string;
    triggers?: string[];
  }[];
  advisor_shares?: string;
  milestone_equity?: string;
  meaningful_dilution: boolean;
  flag: Flag;
  rationale: string;
  source_locations?: SourceLocation[];
}

export interface EconomicsSection {
  liquidation_preference: LiquidationPreference;
  anti_dilution: AntiDilution;
  dividends: Dividends;
  redemption_rights: RedemptionRights;
  pay_to_play: PayToPlay;
  warrants_extras: WarrantsExtras;
  assessment: string[];
}

// =============================================================================
// OWNERSHIP & DILUTION MECHANICS
// =============================================================================

export interface OptionPool {
  current_size_percent?: number;
  created_pre_or_post_money?: 'pre_money' | 'post_money';
  automatic_topups?: string;
  approval_requirements?: string;
  source_locations?: SourceLocation[];
}

export interface ConvertibleInstrument {
  type: 'SAFE' | 'CLA' | 'convertible_note' | 'other';
  outstanding_amount?: number;
  currency?: string;
  valuation_cap?: number;
  discount_percent?: number;
  mfn_clause: boolean;
  conversion_triggers?: string[];
  impact_on_ownership?: string;
  source_locations?: SourceLocation[];
}

export interface FounderVesting {
  current_vesting_status?: string;
  new_reverse_vesting?: string;
  good_leaver_definition?: string;
  good_leaver_treatment?: string;
  bad_leaver_definition?: string;
  bad_leaver_treatment?: string;
  acceleration_on_exit?: boolean;
  acceleration_on_termination?: boolean;
  source_locations?: SourceLocation[];
}

export interface OwnershipSection {
  option_pool: OptionPool;
  convertible_instruments: ConvertibleInstrument[];
  warrants_dilutive?: string;
  founder_vesting: FounderVesting;
  cap_table_notes: string[];
}

// =============================================================================
// CONTROL & GOVERNANCE RIGHTS
// =============================================================================

export interface BoardComposition {
  board_size?: number;
  investor_seats?: number;
  founder_seats?: number;
  independent_seats?: number;
  our_board_seat?: boolean;
  our_observer_rights?: boolean;
  independent_selection?: string;
  source_locations?: SourceLocation[];
}

export interface ProtectiveProvisions {
  matters_requiring_consent: {
    matter: string;
    consent_required_from: string;
  }[];
  flag: Flag;
  rationale: string;
  source_locations?: SourceLocation[];
}

export interface VotingRights {
  ordinary_resolution_threshold?: number;
  special_resolution_threshold?: number;
  class_voting_rights?: string[];
  blocking_power_analysis?: string;
  source_locations?: SourceLocation[];
}

export interface DragAlong {
  who_can_drag?: string;
  who_gets_dragged?: string;
  vote_threshold_percent?: number;
  triggering_events?: string[];
  minimum_price_protection?: string;
  investor_protections?: string[];
  flag: Flag;
  rationale: string;
  source_locations?: SourceLocation[];
}

export interface TagAlong {
  who_has_rights?: string;
  on_what_transfers?: string;
  can_participate_in_secondary?: boolean;
  flag: Flag;
  rationale: string;
  source_locations?: SourceLocation[];
}

export interface QuorumRules {
  board_quorum?: string;
  shareholder_quorum?: string;
  bypass_mechanisms?: string[];
  source_locations?: SourceLocation[];
}

export interface ControlSection {
  board: BoardComposition;
  protective_provisions: ProtectiveProvisions;
  voting_rights: VotingRights;
  drag_along: DragAlong;
  tag_along: TagAlong;
  quorum_rules: QuorumRules;
  assessment: string[];
}

// =============================================================================
// INVESTOR RIGHTS: FOLLOW-ON, INFORMATION, LIQUIDITY
// =============================================================================

export interface PreEmptionRights {
  has_rights: boolean;
  scope?: string;
  exclusions?: string[];
  duration?: string;
  major_investor_threshold?: string;
  flag: Flag;
  rationale: string;
  source_locations?: SourceLocation[];
}

export interface SuperProRata {
  has_rights: boolean;
  priority_details?: string;
  mfn_protection?: boolean;
  source_locations?: SourceLocation[];
}

export interface ROFR {
  has_rights: boolean;
  order?: string;
  co_sale_rights?: boolean;
  secondary_impact?: string;
  flag: Flag;
  rationale: string;
  source_locations?: SourceLocation[];
}

export interface InformationRights {
  reporting_frequency?: string;
  reporting_content?: string[];
  inspection_rights?: string;
  major_investor_only?: boolean;
  we_qualify?: boolean;
  flag: Flag;
  rationale: string;
  source_locations?: SourceLocation[];
}

export interface RegistrationRights {
  demand_rights?: boolean;
  piggyback_rights?: boolean;
  s1_rights?: boolean;
  lock_up_period?: string;
  unusual_restrictions?: string[];
  source_locations?: SourceLocation[];
}

export interface TransferRestrictions {
  lock_up_period?: string;
  consent_requirements?: string;
  permitted_transferees?: string[];
  flag: Flag;
  rationale: string;
  source_locations?: SourceLocation[];
}

export interface MFNClause {
  we_have_mfn?: boolean;
  others_have_mfn?: boolean;
  impact_assessment?: string;
  source_locations?: SourceLocation[];
}

export interface InvestorRightsSection {
  pre_emption: PreEmptionRights;
  super_pro_rata: SuperProRata;
  rofr: ROFR;
  information_rights: InformationRights;
  registration_rights: RegistrationRights;
  transfer_restrictions: TransferRestrictions;
  mfn_clause: MFNClause;
  follow_on_summary: string[];
  information_summary: string[];
  liquidity_summary: string[];
}

// =============================================================================
// EXIT & LIQUIDITY SPECIFICS
// =============================================================================

export interface DistributionWaterfall {
  allocation_order: string[];
  carve_outs?: string[];
  example_scenarios?: {
    scenario: string;
    outcome: string;
  }[];
  source_locations?: SourceLocation[];
}

export interface ManagementIncentives {
  mip_exists?: boolean;
  exit_bonus?: string;
  sweet_equity?: string;
  approval_requirements?: string;
  alignment_assessment?: string;
  source_locations?: SourceLocation[];
}

export interface IPOConversion {
  automatic_conversion?: boolean;
  conversion_ratio_adjustments?: string;
  source_locations?: SourceLocation[];
}

export interface PutCallOptions {
  puts_we_have?: {
    trigger?: string;
    price_formula?: string;
    exercise_window?: string;
  }[];
  calls_others_have?: {
    holder?: string;
    trigger?: string;
    price_formula?: string;
    exercise_window?: string;
  }[];
  source_locations?: SourceLocation[];
}

export interface ExitSection {
  distribution_waterfall: DistributionWaterfall;
  management_incentives: ManagementIncentives;
  ipo_conversion: IPOConversion;
  put_call_options: PutCallOptions;
}

// =============================================================================
// GC-FOCUSED LEGAL & REGULATORY ISSUES
// =============================================================================

export interface ConflictsAlignment {
  related_party_approvals?: string;
  special_investor_rights?: string[];
  side_letter_concerns?: string[];
  flag: Flag;
  rationale: string;
  source_locations?: SourceLocation[];
}

export interface RepsWarrantiesIndemnities {
  company_reps_scope?: string;
  founder_reps_scope?: string;
  caps?: string;
  baskets?: string;
  limitation_periods?: string;
  personal_guarantees?: boolean;
  unusual_indemnities?: string[];
  flag: Flag;
  rationale: string;
  source_locations?: SourceLocation[];
}

export interface DisputeResolution {
  governing_law: string;
  dispute_mechanism: 'courts' | 'arbitration' | 'hybrid';
  seat?: string;
  rules?: string;
  escalation_process?: string[];
  source_locations?: SourceLocation[];
}

export interface RegulatoryCompliance {
  aml_kyc_covenants?: boolean;
  sanctions_covenants?: boolean;
  anti_bribery_covenants?: boolean;
  investor_specific_obligations?: string[];
  fund_conflicts?: string[];
  source_locations?: SourceLocation[];
}

export interface IPKeyPerson {
  ip_ownership_confirmed?: boolean;
  ip_assignment_status?: string;
  key_founder_non_compete?: boolean;
  non_solicit?: boolean;
  confidentiality?: boolean;
  leaver_ip_interplay?: string;
  source_locations?: SourceLocation[];
}

export interface FundDocConsistency {
  transfer_restrictions_ok?: boolean;
  holding_period_issues?: string[];
  concentration_issues?: string[];
  sector_geography_issues?: string[];
  lpa_conflicts?: string[];
  source_locations?: SourceLocation[];
}

export interface LegalSection {
  conflicts_alignment: ConflictsAlignment;
  reps_warranties_indemnities: RepsWarrantiesIndemnities;
  dispute_resolution: DisputeResolution;
  regulatory_compliance: RegulatoryCompliance;
  ip_key_person: IPKeyPerson;
  fund_doc_consistency: FundDocConsistency;
  gc_focus_points: string[];
  comfort_points: string[];
}

// =============================================================================
// FLAG SUMMARY
// =============================================================================

export interface FlagSummary {
  economics_downside: {
    flag: Flag;
    justification: string;
  };
  control_governance: {
    flag: Flag;
    justification: string;
  };
  dilution_ownership: {
    flag: Flag;
    justification: string;
  };
  investor_rights_follow_on: {
    flag: Flag;
    justification: string;
  };
  legal_gc_risk: {
    flag: Flag;
    justification: string;
  };
  missing_information?: string[];
  assumptions_made?: string[];
}

// =============================================================================
// SOURCE LOCATION (for audit trail)
// =============================================================================

export interface SourceLocation {
  page: number;
  section_title?: string;
  clause_reference?: string;
  bbox?: {
    x: number;      // percentage of page width (0-1)
    y: number;      // percentage of page height (0-1)
    width: number;  // percentage of page width
    height: number; // percentage of page height
  };
  snippet_url?: string;
  extracted_text?: string;
}

// =============================================================================
// COMPLETE ANALYSIS RESULT
// =============================================================================

export interface LegalAnalysisResult {
  // Document metadata
  document_name: string;
  jurisdiction: Jurisdiction;
  instrument_type: InstrumentType;
  instrument_type_description?: string; // For 'OTHER' type
  closest_analog?: string; // For 'OTHER' type
  
  // Analysis sections
  executive_summary: ExecutiveSummaryPoint[];
  transaction_snapshot: TransactionSnapshot;
  economics: EconomicsSection;
  ownership: OwnershipSection;
  control: ControlSection;
  investor_rights: InvestorRightsSection;
  exit: ExitSection;
  legal: LegalSection;
  flag_summary: FlagSummary;
  
  // Metadata
  analysis_date: string;
  model_version: string;
  confidence_score?: number;
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

export interface LegalAnalysisRequest {
  fileBuffer: Buffer;
  filename: string;
  companyId?: string;
  companySlug?: string;
  dryRun?: boolean;
}

export interface LegalAnalysisResponse {
  success: boolean;
  analysis?: LegalAnalysisResult;
  analysisId?: string;
  snippets?: {
    section: string;
    page: number;
    url: string;
  }[];
  error?: string;
}

// =============================================================================
// DATABASE TYPES (matching Supabase schema)
// =============================================================================

export interface LegalAnalysisRow {
  id: string;
  company_id: string | null;
  document_name: string;
  document_type: InstrumentType;
  jurisdiction: Jurisdiction;
  analysis: LegalAnalysisResult;
  executive_summary: ExecutiveSummaryPoint[];
  flags: FlagSummary;
  created_at: string;
  created_by: string | null;
}

export interface LegalTermSourceRow {
  id: string;
  analysis_id: string;
  section: string;
  term_key: string;
  extracted_value: string | null;
  page_number: number;
  snippet_url: string | null;
  bbox: SourceLocation['bbox'] | null;
  confidence: number | null;
  created_at: string;
}


