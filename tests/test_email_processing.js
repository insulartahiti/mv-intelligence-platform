// Test script for email processing functionality
const fs = require('fs');

async function testEmailProcessing() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('🧪 Testing Email Processing System...\n');

  // Test 1: Add email to inbox
  console.log('1. Adding test email to inbox...');
  try {
    const emailResponse = await fetch(`${baseUrl}/api/emails/inbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emailId: 'test-email-001',
        subject: 'Portfolio Update: FintechFlow Q4 Results',
        from: 'ceo@fintechflow.com',
        to: 'portfolio@mvintel.com',
        date: new Date().toISOString(),
        content: `
          Dear Portfolio Team,
          
          I'm pleased to share our Q4 2024 results for FintechFlow:
          
          Key Metrics:
          - ARR: $2.4M (up 45% from Q3)
          - MRR: $200K (up 12% month-over-month)
          - Customer Growth: 150 new customers this quarter
          - Churn Rate: 2.1% (down from 3.5% last quarter)
          
          We're on track for our Series B raise in Q1 2025, targeting $15M at a $60M pre-money valuation.
          
          The team is excited about our new RIA connectivity features and the positive feedback from our enterprise customers.
          
          Best regards,
          Sarah Chen, CEO
        `,
        priority: 'high'
      })
    });
    
    const emailResult = await emailResponse.json();
    if (emailResponse.ok) {
      console.log(`✅ Email added to inbox: ${emailResult.email?.email_id}`);
    } else {
      console.log(`❌ Email addition failed: ${emailResult.error}`);
    }
  } catch (error) {
    console.log(`❌ Email addition error: ${error.message}`);
  }

  // Test 2: Process email queue
  console.log('\n2. Processing email queue...');
  try {
    const queueResponse = await fetch(`${baseUrl}/api/emails/process-queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchSize: 5 })
    });
    
    const queueResult = await queueResponse.json();
    if (queueResponse.ok) {
      console.log(`✅ Queue processing completed: ${queueResult.processed} processed, ${queueResult.errors} errors`);
      if (queueResult.results) {
        queueResult.results.forEach(result => {
          console.log(`  - ${result.emailId}: ${result.status} (${result.insights} insights, ${result.kpis} KPIs)`);
        });
      }
    } else {
      console.log(`❌ Queue processing failed: ${queueResult.error}`);
    }
  } catch (error) {
    console.log(`❌ Queue processing error: ${error.message}`);
  }

  // Test 3: Get inbox emails
  console.log('\n3. Retrieving inbox emails...');
  try {
    const inboxResponse = await fetch(`${baseUrl}/api/emails/inbox`);
    const inboxResult = await inboxResponse.json();
    
    if (inboxResponse.ok) {
      console.log(`✅ Retrieved ${inboxResult.emails.length} emails from inbox`);
      console.log(`✅ Retrieved ${inboxResult.portfolioEmails.length} portfolio-relevant emails`);
      
      if (inboxResult.emails.length > 0) {
        const email = inboxResult.emails[0];
        console.log(`  - Sample email: "${email.subject}" from ${email.from_email}`);
        console.log(`  - Status: ${email.status}, Priority: ${email.priority}`);
        if (email.email_insights) {
          console.log(`  - Insights: ${email.email_insights.length}`);
        }
      }
    } else {
      console.log(`❌ Inbox retrieval failed: ${inboxResult.error}`);
    }
  } catch (error) {
    console.log(`❌ Inbox retrieval error: ${error.message}`);
  }

  // Test 4: Test knowledge graph integration
  console.log('\n4. Testing knowledge graph integration...');
  try {
    const kgResponse = await fetch(`${baseUrl}/api/knowledge-graph/email-integration?emailId=test-email-001`);
    const kgResult = await kgResponse.json();
    
    if (kgResponse.ok) {
      console.log(`✅ Knowledge graph integration successful`);
      console.log(`  - Analysis: ${kgResult.analysis ? 'Yes' : 'No'}`);
      console.log(`  - Entities: ${kgResult.entities.length}`);
      console.log(`  - Insights: ${kgResult.insights.length}`);
    } else {
      console.log(`❌ Knowledge graph integration failed: ${kgResult.error}`);
    }
  } catch (error) {
    console.log(`❌ Knowledge graph integration error: ${error.message}`);
  }

  console.log('\n🎉 Email processing testing completed!');
}

// Run the test
testEmailProcessing().catch(console.error);






