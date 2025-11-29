require('dotenv').config();

class EnrichmentIntegrationTester {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.testResults = [];
  }

  async runComprehensiveTest() {
    console.log('🧪 COMPREHENSIVE ENRICHMENT INTEGRATION TEST');
    console.log('============================================');
    
    const testCases = [
      {
        name: 'Company Name Search',
        query: 'Blue Morpho',
        expectedFields: ['ai_summary', 'enrichment_insights', 'company_info'],
        description: 'Should find companies by name and show enrichment data'
      },
      {
        name: 'Industry Search',
        query: 'fintech companies',
        expectedFields: ['ai_summary', 'enrichment_insights'],
        description: 'Should find companies by industry and show AI insights'
      },
      {
        name: 'Technology Search',
        query: 'defi lending',
        expectedFields: ['ai_summary', 'enrichment_insights'],
        description: 'Should find companies by technology and show enrichment data'
      },
      {
        name: 'Recent Activity Search',
        query: 'recent funding',
        expectedFields: ['ai_summary', 'recent_news'],
        description: 'Should find companies with recent activity and show news data'
      },
      {
        name: 'Stealth Company Search',
        query: 'stealth companies',
        expectedFields: ['ai_summary', 'enrichment_insights'],
        description: 'Should find stealth companies and show enrichment data'
      }
    ];

    for (const testCase of testCases) {
      await this.runTestCase(testCase);
    }

    this.generateReport();
  }

  async runTestCase(testCase) {
    console.log(`\n🔍 Testing: ${testCase.name}`);
    console.log(`   Query: "${testCase.query}"`);
    console.log(`   Description: ${testCase.description}`);
    
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${this.baseUrl}/api/graph/semantic-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: testCase.query, limit: 5 })
      });
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      if (response.ok) {
        const result = await response.json();
        const testResult = this.analyzeResults(testCase, result, responseTime);
        this.testResults.push(testResult);
        
        console.log(`   ✅ Success (${responseTime}ms): ${result.results?.length || 0} results`);
        
        if (result.results && result.results.length > 0) {
          console.log('   📊 Results analysis:');
          result.results.slice(0, 3).forEach((entity, index) => {
            console.log(`      ${index + 1}. ${entity.name} (${entity.type}) - Score: ${entity.similarity?.toFixed(3) || 'N/A'}`);
            
            // Check enrichment data
            const hasEnrichment = entity.metadata?.has_enrichment_data;
            const hasAISummary = !!entity.metadata?.ai_summary;
            const hasInsights = entity.metadata?.enrichment_insights?.length > 0;
            const hasRecentNews = entity.metadata?.recent_news > 0;
            
            console.log(`         Enrichment: ${hasEnrichment ? '✅' : '❌'} | AI Summary: ${hasAISummary ? '✅' : '❌'} | Insights: ${hasInsights ? '✅' : '❌'} | News: ${hasRecentNews ? '✅' : '❌'}`);
            
            if (entity.metadata?.ai_summary) {
              console.log(`         AI Summary: ${entity.metadata.ai_summary.substring(0, 60)}...`);
            }
            
            if (entity.metadata?.enrichment_insights?.length > 0) {
              console.log(`         Insights: ${entity.metadata.enrichment_insights.slice(0, 2).join(', ')}`);
            }
          });
        }
      } else {
        const errorText = await response.text();
        console.log(`   ❌ Failed (${responseTime}ms): ${response.status} - ${errorText}`);
        
        this.testResults.push({
          name: testCase.name,
          status: 'failed',
          responseTime,
          error: errorText,
          results: 0
        });
      }
    } catch (error) {
      console.log(`   ⚠️  Error: ${error.message}`);
      
      this.testResults.push({
        name: testCase.name,
        status: 'error',
        responseTime: Date.now() - startTime,
        error: error.message,
        results: 0
      });
    }
  }

  analyzeResults(testCase, result, responseTime) {
    const results = result.results || [];
    const enrichedResults = results.filter(entity => 
      entity.metadata?.has_enrichment_data || 
      entity.metadata?.ai_summary || 
      entity.metadata?.enrichment_insights?.length > 0
    );
    
    const avgScore = results.length > 0 ? 
      results.reduce((sum, entity) => sum + (entity.similarity || 0), 0) / results.length : 0;
    
    const enrichmentCoverage = results.length > 0 ? 
      (enrichedResults.length / results.length) * 100 : 0;
    
    // Check if expected fields are present
    const fieldAnalysis = testCase.expectedFields.map(field => {
      const hasField = results.some(entity => 
        entity.metadata && entity.metadata[field] && 
        (Array.isArray(entity.metadata[field]) ? entity.metadata[field].length > 0 : true)
      );
      return { field, present: hasField };
    });
    
    return {
      name: testCase.name,
      status: 'success',
      responseTime,
      results: results.length,
      enrichedResults: enrichedResults.length,
      enrichmentCoverage: Math.round(enrichmentCoverage),
      avgScore: Math.round(avgScore * 1000) / 1000,
      fieldAnalysis,
      query: testCase.query
    };
  }

  generateReport() {
    console.log('\n📊 COMPREHENSIVE TEST REPORT');
    console.log('============================');
    
    const totalTests = this.testResults.length;
    const successfulTests = this.testResults.filter(t => t.status === 'success').length;
    const avgResponseTime = this.testResults.reduce((sum, t) => sum + t.responseTime, 0) / totalTests;
    const totalResults = this.testResults.reduce((sum, t) => sum + t.results, 0);
    const totalEnrichedResults = this.testResults.reduce((sum, t) => sum + (t.enrichedResults || 0), 0);
    const overallEnrichmentCoverage = totalResults > 0 ? (totalEnrichedResults / totalResults) * 100 : 0;
    
    console.log(`\n📈 OVERALL STATISTICS:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Successful: ${successfulTests} (${Math.round((successfulTests/totalTests)*100)}%)`);
    console.log(`   Average Response Time: ${Math.round(avgResponseTime)}ms`);
    console.log(`   Total Results: ${totalResults}`);
    console.log(`   Enriched Results: ${totalEnrichedResults}`);
    console.log(`   Enrichment Coverage: ${Math.round(overallEnrichmentCoverage)}%`);
    
    console.log(`\n🔍 TEST-BY-TEST BREAKDOWN:`);
    this.testResults.forEach((test, index) => {
      console.log(`\n   ${index + 1}. ${test.name}`);
      console.log(`      Status: ${test.status.toUpperCase()}`);
      console.log(`      Response Time: ${test.responseTime}ms`);
      console.log(`      Results: ${test.results}`);
      
      if (test.status === 'success') {
        console.log(`      Enriched Results: ${test.enrichedResults} (${test.enrichmentCoverage}%)`);
        console.log(`      Average Score: ${test.avgScore}`);
        
        if (test.fieldAnalysis) {
          console.log(`      Field Analysis:`);
          test.fieldAnalysis.forEach(field => {
            console.log(`         ${field.field}: ${field.present ? '✅' : '❌'}`);
          });
        }
      } else {
        console.log(`      Error: ${test.error}`);
      }
    });
    
    console.log(`\n🎯 ENRICHMENT INTEGRATION ASSESSMENT:`);
    
    if (overallEnrichmentCoverage > 80) {
      console.log(`   ✅ EXCELLENT: ${Math.round(overallEnrichmentCoverage)}% enrichment coverage`);
    } else if (overallEnrichmentCoverage > 60) {
      console.log(`   ✅ GOOD: ${Math.round(overallEnrichmentCoverage)}% enrichment coverage`);
    } else if (overallEnrichmentCoverage > 40) {
      console.log(`   ⚠️  MODERATE: ${Math.round(overallEnrichmentCoverage)}% enrichment coverage`);
    } else {
      console.log(`   ❌ POOR: ${Math.round(overallEnrichmentCoverage)}% enrichment coverage`);
    }
    
    if (avgResponseTime < 1000) {
      console.log(`   ✅ EXCELLENT: ${Math.round(avgResponseTime)}ms average response time`);
    } else if (avgResponseTime < 2000) {
      console.log(`   ✅ GOOD: ${Math.round(avgResponseTime)}ms average response time`);
    } else {
      console.log(`   ⚠️  SLOW: ${Math.round(avgResponseTime)}ms average response time`);
    }
    
    console.log(`\n🎉 ENRICHMENT INTEGRATION TEST COMPLETE!`);
  }
}

// Main execution
async function main() {
  const tester = new EnrichmentIntegrationTester();
  await tester.runComprehensiveTest();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = EnrichmentIntegrationTester;




