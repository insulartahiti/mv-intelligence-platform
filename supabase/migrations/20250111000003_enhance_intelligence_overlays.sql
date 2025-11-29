-- Enhance Intelligence Overlays with Investment Analysis Fields
-- Add new columns for comprehensive investment analysis

ALTER TABLE intelligence_overlays 
ADD COLUMN IF NOT EXISTS investment_thesis TEXT,
ADD COLUMN IF NOT EXISTS market_analysis TEXT,
ADD COLUMN IF NOT EXISTS due_diligence_priorities TEXT[];

-- Add comments for documentation
COMMENT ON COLUMN intelligence_overlays.investment_thesis IS 'Clear investment thesis with specific reasons why this company fits the portfolio';
COMMENT ON COLUMN intelligence_overlays.market_analysis IS 'Market analysis including TAM, competition, and growth drivers';
COMMENT ON COLUMN intelligence_overlays.due_diligence_priorities IS 'Array of due diligence priorities for investment evaluation';

-- Create index for due diligence priorities
CREATE INDEX IF NOT EXISTS idx_intelligence_overlays_due_diligence_priorities 
ON intelligence_overlays USING GIN(due_diligence_priorities);
