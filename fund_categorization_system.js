require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Fund Categorization System
 * 
 * This system categorizes portfolio companies into proper fund categories
 * based on investment amounts and creates appropriate fund entities and relationships.
 */

class FundCategorizationSystem {
  constructor() {
    this.fundCategories = {
      'MVF1': {
        name: 'Motive Ventures Fund I',
        description: 'First venture fund',
        investmentRange: { min: 0, max: 10000000 }, // 0-10M
        color: '#FF6B6B'
      },
      'MVF2': {
        name: 'Motive Ventures Fund II', 
        description: 'Second venture fund',
        investmentRange: { min: 10000000, max: 50000000 }, // 10M-50M
        color: '#4ECDC4'
      },
      'Balance Sheet': {
        name: 'Balance Sheet/Former Funds',
        description: 'Balance sheet investments and former fund investments',
        investmentRange: { min: 50000000, max: Infinity }, // 50M+
        color: '#45B7D1'
      },
      'Motive AAV': {
        name: 'Motive AAV',
        description: 'Motive AAV investments',
        investmentRange: { min: 0, max: 5000000 }, // 0-5M (special category)
        color: '#96CEB4'
      }
    };
    
    this.stats = {
      fundEntitiesCreated: 0,
      relationshipsCreated: 0,
      companiesCategorized: 0,
      errors: 0
    };
  }

  /**
   * Run the complete fund categorization process
   */
  async runFundCategorization() {
    console.log('🏦 Starting Fund Categorization System...\n');
    
    try {
      // Step 1: Create fund entities
      await this.createFundEntities();
      
      // Step 2: Categorize portfolio companies
      await this.categorizePortfolioCompanies();
      
      // Step 3: Create fund relationships
      await this.createFundRelationships();
      
      // Step 4: Update schema if needed
      await this.updateSchemaForFunds();
      
      // Step 5: Validate and summarize
      await this.validateAndSummarize();
      
      this.printSummary();
      
    } catch (error) {
      console.error('❌ Fund categorization failed:', error);
      this.stats.errors++;
    }
  }

  /**
   * Step 1: Create fund entities in the database
   */
  async createFundEntities() {
    console.log('📊 Step 1: Creating Fund Entities...');
    
    for (const [fundKey, fundData] of Object.entries(this.fundCategories)) {
      try {
        // Check if fund already exists
        const { data: existingFund } = await supabase
          .schema('graph')
          .from('entities')
          .select('id, name')
          .eq('name', fundData.name)
          .eq('type', 'fund')
          .single();

        if (existingFund) {
          console.log(`   ⏭️  ${fundData.name} already exists`);
          continue;
        }

        // Create fund entity
        const { data: fundEntity, error } = await supabase
          .schema('graph')
          .from('entities')
          .insert({
            name: fundData.name,
            type: 'fund',
            description: fundData.description,
            industry: 'Venture Capital',
            domain: fundKey.toLowerCase().replace(' ', '-'),
            fund: fundKey,
            is_internal: true,
            is_portfolio: false,
            is_pipeline: false,
            source: 'fund_categorization_system',
            enrichment_data: {
              fund_category: fundKey,
              investment_range: fundData.investmentRange,
              color: fundData.color,
              created_by: 'fund_categorization_system'
            }
          })
          .select()
          .single();

        if (error) {
          console.log(`   ❌ Error creating ${fundData.name}: ${error.message}`);
          this.stats.errors++;
        } else {
          console.log(`   ✅ Created ${fundData.name} (ID: ${fundEntity.id})`);
          this.stats.fundEntitiesCreated++;
        }

      } catch (error) {
        console.log(`   ❌ Error with ${fundData.name}: ${error.message}`);
        this.stats.errors++;
      }
    }
  }

  /**
   * Step 2: Categorize portfolio companies by investment amount
   */
  async categorizePortfolioCompanies() {
    console.log('\n🏢 Step 2: Categorizing Portfolio Companies...');
    
    try {
      const { data: portfolioCompanies } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, fund, investment_amount')
        .eq('is_portfolio', true)
        .not('fund', 'is', null)
        .limit(100);

      console.log(`   Found ${portfolioCompanies?.length || 0} portfolio companies to categorize`);

      for (const company of portfolioCompanies || []) {
        const investmentAmount = company.investment_amount || company.fund || 0;
        const fundCategory = this.categorizeInvestmentAmount(investmentAmount);
        
        if (fundCategory) {
          // Update company with fund category
          const { error } = await supabase
            .schema('graph')
            .from('entities')
            .update({
              enrichment_data: {
                fund_category: fundCategory,
                investment_amount: investmentAmount,
                categorized_by: 'fund_categorization_system'
              }
            })
            .eq('id', company.id);

          if (error) {
            console.log(`   ❌ Error updating ${company.name}: ${error.message}`);
            this.stats.errors++;
          } else {
            console.log(`   ✅ ${company.name} → ${fundCategory} ($${investmentAmount.toLocaleString()})`);
            this.stats.companiesCategorized++;
          }
        }
      }

    } catch (error) {
      console.error('   ❌ Error categorizing companies:', error);
      this.stats.errors++;
    }
  }

  /**
   * Step 3: Create relationships between companies and funds
   */
  async createFundRelationships() {
    console.log('\n🔗 Step 3: Creating Fund Relationships...');
    
    try {
      // Get all fund entities
      const { data: fundEntities } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, enrichment_data')
        .eq('type', 'fund')
        .not('enrichment_data->fund_category', 'is', null);

      // Get categorized portfolio companies
      const { data: portfolioCompanies } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, enrichment_data')
        .eq('is_portfolio', true)
        .not('enrichment_data->fund_category', 'is', null);

      console.log(`   Found ${fundEntities?.length || 0} funds and ${portfolioCompanies?.length || 0} categorized companies`);

      for (const company of portfolioCompanies || []) {
        const companyFundCategory = company.enrichment_data?.fund_category;
        const fundEntity = fundEntities?.find(fund => 
          fund.enrichment_data?.fund_category === companyFundCategory
        );

        if (fundEntity) {
          // Check if relationship already exists
          const { data: existingRelationship } = await supabase
            .schema('graph')
            .from('edges')
            .select('id')
            .or(`source.eq.${company.id},target.eq.${company.id}`)
            .or(`source.eq.${fundEntity.id},target.eq.${fundEntity.id}`);

          const hasRelationship = existingRelationship?.some(edge => 
            (edge.source === company.id && edge.target === fundEntity.id) ||
            (edge.source === fundEntity.id && edge.target === company.id)
          );

          if (!hasRelationship) {
            // Create relationship: company is portfolio_company_of fund
            const { error } = await supabase
              .schema('graph')
              .from('edges')
              .insert({
                source: company.id,
                target: fundEntity.id,
                kind: 'portfolio_company_of',
                strength_score: 0.9,
                interaction_count: 1,
                last_interaction_date: new Date().toISOString(),
                relationship_context: `Portfolio company of ${fundEntity.name}`,
                relationship_notes: `Categorized by investment amount: $${company.enrichment_data?.investment_amount?.toLocaleString() || 'Unknown'}`
              });

            if (error) {
              console.log(`   ❌ Error creating relationship for ${company.name}: ${error.message}`);
              this.stats.errors++;
            } else {
              console.log(`   ✅ ${company.name} → ${fundEntity.name}`);
              this.stats.relationshipsCreated++;
            }
          } else {
            console.log(`   ⏭️  ${company.name} already connected to ${fundEntity.name}`);
          }
        }
      }

    } catch (error) {
      console.error('   ❌ Error creating relationships:', error);
      this.stats.errors++;
    }
  }

  /**
   * Step 4: Update schema to support fund categorization
   */
  async updateSchemaForFunds() {
    console.log('\n🔧 Step 4: Updating Schema for Funds...');
    
    try {
      // Add fund categorization fields to entities table if they don't exist
      const schemaUpdates = [
        `ALTER TABLE graph.entities ADD COLUMN IF NOT EXISTS fund_category text;`,
        `ALTER TABLE graph.entities ADD COLUMN IF NOT EXISTS investment_amount numeric;`,
        `ALTER TABLE graph.entities ADD COLUMN IF NOT EXISTS fund_color text;`,
        `CREATE INDEX IF NOT EXISTS idx_entities_fund_category ON graph.entities(fund_category);`,
        `CREATE INDEX IF NOT EXISTS idx_entities_investment_amount ON graph.entities(investment_amount);`
      ];

      for (const update of schemaUpdates) {
        try {
          const { error } = await supabase.rpc('exec_sql', { sql: update });
          if (error) {
            console.log(`   ⚠️  Schema update warning: ${error.message}`);
          } else {
            console.log(`   ✅ Schema update applied`);
          }
        } catch (error) {
          console.log(`   ⚠️  Schema update skipped: ${error.message}`);
        }
      }

    } catch (error) {
      console.log(`   ⚠️  Schema updates not applied: ${error.message}`);
    }
  }

  /**
   * Step 5: Validate and summarize results
   */
  async validateAndSummarize() {
    console.log('\n📊 Step 5: Validation and Summary...');
    
    try {
      // Get final counts
      const { count: fundCount } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'fund');

      const { count: categorizedCompanies } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true })
        .eq('is_portfolio', true)
        .not('enrichment_data->fund_category', 'is', null);

      const { count: fundRelationships } = await supabase
        .schema('graph')
        .from('edges')
        .select('*', { count: 'exact', head: true })
        .eq('kind', 'portfolio_company_of');

      console.log(`   Final counts:`);
      console.log(`   - Fund entities: ${fundCount}`);
      console.log(`   - Categorized companies: ${categorizedCompanies}`);
      console.log(`   - Fund relationships: ${fundRelationships}`);

      // Show fund distribution
      const { data: fundDistribution } = await supabase
        .schema('graph')
        .from('entities')
        .select('enrichment_data')
        .eq('is_portfolio', true)
        .not('enrichment_data->fund_category', 'is', null);

      const distribution = {};
      fundDistribution?.forEach(company => {
        const category = company.enrichment_data?.fund_category;
        distribution[category] = (distribution[category] || 0) + 1;
      });

      console.log(`   Fund distribution:`);
      Object.entries(distribution).forEach(([category, count]) => {
        console.log(`   - ${category}: ${count} companies`);
      });

    } catch (error) {
      console.error('   ❌ Validation error:', error);
      this.stats.errors++;
    }
  }

  /**
   * Categorize investment amount into fund category
   */
  categorizeInvestmentAmount(amount) {
    if (amount <= 5000000) return 'Motive AAV';
    if (amount <= 10000000) return 'MVF1';
    if (amount <= 50000000) return 'MVF2';
    return 'Balance Sheet';
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log('\n🏦 Fund Categorization Summary');
    console.log('='.repeat(50));
    
    console.log('\n📊 Results:');
    console.log(`   ✅ Fund Entities Created: ${this.stats.fundEntitiesCreated}`);
    console.log(`   ✅ Companies Categorized: ${this.stats.companiesCategorized}`);
    console.log(`   ✅ Relationships Created: ${this.stats.relationshipsCreated}`);
    console.log(`   ❌ Errors: ${this.stats.errors}`);
    
    console.log('\n🎯 Fund Categories:');
    Object.entries(this.fundCategories).forEach(([key, data]) => {
      console.log(`   - ${key}: ${data.name}`);
      console.log(`     Range: $${data.investmentRange.min.toLocaleString()} - $${data.investmentRange.max === Infinity ? '∞' : data.investmentRange.max.toLocaleString()}`);
    });
    
    console.log('\n🚀 Next Steps:');
    console.log('   1. Test connection queries with fund relationships');
    console.log('   2. Update dashboard to show fund categories');
    console.log('   3. Create fund-specific analytics');
    console.log('   4. Set up automated fund categorization for new companies');
  }
}

// Run the fund categorization system
async function main() {
  const fundSystem = new FundCategorizationSystem();
  await fundSystem.runFundCategorization();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { FundCategorizationSystem };




