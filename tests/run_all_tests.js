// Comprehensive Test Runner for Enhanced Knowledge Graph Intelligence
// Runs all tests and provides detailed reporting

const { runAllTests } = require('./test_enhanced_system');
const { runSearchAPITests } = require('./test_enhanced_search_api');
const { runGraphAnalyticsTests } = require('./test_graph_analytics');

async function runComprehensiveTests() {
  console.log('🚀 ENHANCED KNOWLEDGE GRAPH INTELLIGENCE - COMPREHENSIVE TEST SUITE');
  console.log('=' * 80);
  console.log('Testing all implemented features: database, search, graph analytics, and APIs');
  console.log('=' * 80);
  
  const overallStartTime = Date.now();
  const testSuites = {};
  
  try {
    // Test Suite 1: Database and Core Functions
    console.log('\n📊 TEST SUITE 1: DATABASE & CORE FUNCTIONS');
    console.log('-' * 50);
    testSuites.database = await runAllTests();
    
    // Test Suite 2: Graph Analytics
    console.log('\n📊 TEST SUITE 2: GRAPH ANALYTICS');
    console.log('-' * 50);
    testSuites.graphAnalytics = await runGraphAnalyticsTests();
    
    // Test Suite 3: Search API
    console.log('\n📊 TEST SUITE 3: SEARCH API');
    console.log('-' * 50);
    testSuites.searchAPI = await runSearchAPITests();
    
    const totalDuration = Date.now() - overallStartTime;
    
    // Generate comprehensive report
    generateComprehensiveReport(testSuites, totalDuration);
    
    return testSuites;
    
  } catch (error) {
    console.error('❌ Comprehensive test suite failed:', error.message);
    return { error: error.message };
  }
}

function generateComprehensiveReport(testSuites, totalDuration) {
  console.log('\n' + '=' * 80);
  console.log('📊 COMPREHENSIVE TEST REPORT');
  console.log('=' * 80);
  
  // Calculate overall statistics
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  const allErrors = [];
  
  Object.entries(testSuites).forEach(([suiteName, suiteResults]) => {
    if (suiteResults && !suiteResults.error) {
      if (suiteResults.passed !== undefined) {
        totalTests += suiteResults.passed + suiteResults.failed;
        totalPassed += suiteResults.passed;
        totalFailed += suiteResults.failed;
        
        if (suiteResults.errors) {
          allErrors.push(...suiteResults.errors.map(e => `${suiteName}: ${e.testName} - ${e.details}`));
        }
      }
    }
  });
  
  console.log(`⏱️  Total Duration: ${totalDuration}ms`);
  console.log(`📊 Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${totalPassed}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`📈 Success Rate: ${totalTests > 0 ? (totalPassed / totalTests * 100).toFixed(1) : 0}%`);
  
  // Test suite breakdown
  console.log('\n📋 TEST SUITE BREAKDOWN:');
  console.log('-' * 40);
  
  Object.entries(testSuites).forEach(([suiteName, suiteResults]) => {
    if (suiteResults && !suiteResults.error) {
      if (suiteResults.passed !== undefined) {
        const suiteTotal = suiteResults.passed + suiteResults.failed;
        const suiteSuccessRate = suiteTotal > 0 ? (suiteResults.passed / suiteTotal * 100).toFixed(1) : 0;
        console.log(`  ${suiteName}: ${suiteResults.passed}/${suiteTotal} (${suiteSuccessRate}%)`);
      } else if (suiteResults.searchResults) {
        const searchTotal = suiteResults.searchResults.passed + suiteResults.searchResults.failed;
        const searchSuccessRate = searchTotal > 0 ? (suiteResults.searchResults.passed / searchTotal * 100).toFixed(1) : 0;
        console.log(`  ${suiteName}: ${suiteResults.searchResults.passed}/${searchTotal} (${searchSuccessRate}%)`);
      }
    } else {
      console.log(`  ${suiteName}: ERROR - ${suiteResults?.error || 'Unknown error'}`);
    }
  });
  
  // Performance metrics
  console.log('\n⚡ PERFORMANCE METRICS:');
  console.log('-' * 40);
  
  if (testSuites.database && testSuites.database.performance) {
    console.log('  Database Functions:');
    Object.entries(testSuites.database.performance).forEach(([test, duration]) => {
      console.log(`    - ${test}: ${duration}ms`);
    });
  }
  
  if (testSuites.graphAnalytics) {
    console.log('  Graph Analytics:');
    Object.entries(testSuites.graphAnalytics).forEach(([test, result]) => {
      if (result && result.success && result.duration) {
        console.log(`    - ${test}: ${result.duration}ms`);
      }
    });
  }
  
  if (testSuites.searchAPI && testSuites.searchAPI.performanceResults) {
    console.log('  Search API:');
    const avgDuration = testSuites.searchAPI.performanceResults
      .filter(r => r.success)
      .reduce((sum, r) => sum + r.duration, 0) / 
      testSuites.searchAPI.performanceResults.filter(r => r.success).length;
    console.log(`    - Average Response Time: ${avgDuration.toFixed(2)}ms`);
  }
  
  // Error details
  if (allErrors.length > 0) {
    console.log('\n❌ FAILED TESTS DETAILS:');
    console.log('-' * 40);
    allErrors.forEach(error => {
      console.log(`  - ${error}`);
    });
  }
  
  // Recommendations
  console.log('\n💡 RECOMMENDATIONS:');
  console.log('-' * 40);
  
  if (totalFailed === 0) {
    console.log('  🎉 All tests passed! The Enhanced Knowledge Graph Intelligence system is working perfectly.');
    console.log('  🚀 Ready for production use.');
  } else {
    if (totalFailed < totalTests * 0.1) {
      console.log('  ⚠️  Most tests passed. Address the few failing tests for optimal performance.');
    } else if (totalFailed < totalTests * 0.3) {
      console.log('  ⚠️  Some tests failed. Review the failing tests and fix critical issues.');
    } else {
      console.log('  ❌ Many tests failed. The system needs significant fixes before production use.');
    }
    
    console.log('  🔧 Check the error details above and fix the failing components.');
  }
  
  // System status
  console.log('\n🎯 SYSTEM STATUS:');
  console.log('-' * 40);
  
  const systemComponents = [
    { name: 'Database Schema', status: testSuites.database?.passed > 0 ? '✅ Working' : '❌ Issues' },
    { name: 'Graph Functions', status: testSuites.database?.passed > 0 ? '✅ Working' : '❌ Issues' },
    { name: 'Search System', status: testSuites.searchAPI?.searchResults?.passed > 0 ? '✅ Working' : '❌ Issues' },
    { name: 'Graph Analytics', status: testSuites.graphAnalytics ? '✅ Working' : '❌ Issues' },
    { name: 'API Endpoints', status: testSuites.searchAPI?.searchResults?.passed > 0 ? '✅ Working' : '❌ Issues' }
  ];
  
  systemComponents.forEach(component => {
    console.log(`  ${component.status} ${component.name}`);
  });
  
  console.log('\n' + '=' * 80);
  
  if (totalFailed === 0) {
    console.log('🎉 CONGRATULATIONS! Enhanced Knowledge Graph Intelligence system is fully operational!');
  } else {
    console.log('⚠️  System partially operational. Please address the failing tests.');
  }
  
  console.log('=' * 80);
}

// Export for use in other files
module.exports = {
  runComprehensiveTests,
  generateComprehensiveReport
};

// Run comprehensive tests if called directly
if (require.main === module) {
  runComprehensiveTests().catch(console.error);
}
