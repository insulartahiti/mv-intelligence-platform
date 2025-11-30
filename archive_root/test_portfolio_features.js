// Test script for portfolio email forwarding and file upload features
const fs = require('fs');
const path = require('path');

async function testPortfolioFeatures() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('🧪 Testing Portfolio Features...\n');

  // Test 1: Create a test company
  console.log('1. Creating test company...');
  try {
    const companyResponse = await fetch(`${baseUrl}/api/test-insert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'companies',
        data: {
          name: 'Test Portfolio Company',
          domain: 'test-portfolio.com',
          description: 'A test company for portfolio features'
        }
      })
    });
    
    const companyResult = await companyResponse.json();
    const companyId = companyResult.id;
    console.log(`✅ Company created with ID: ${companyId}\n`);

    // Test 2: Test email forwarding
    console.log('2. Testing email forwarding...');
    try {
      const emailResponse = await fetch(`${baseUrl}/api/portfolio/forward-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: companyId,
          googleWorkspaceId: 'test-workspace-123',
          emailSubject: 'Test Portfolio Email',
          emailContent: 'This is a test email for portfolio forwarding functionality.',
          emailFrom: 'test@example.com',
          emailTo: 'portfolio@workspace.com',
          emailDate: new Date().toISOString().split('T')[0]
        })
      });
      
      const emailResult = await emailResponse.json();
      if (emailResponse.ok) {
        console.log(`✅ Email forwarded successfully: ${emailResult.emailId}`);
      } else {
        console.log(`❌ Email forwarding failed: ${emailResult.error}`);
      }
    } catch (error) {
      console.log(`❌ Email forwarding error: ${error.message}`);
    }

    // Test 3: Test file upload
    console.log('\n3. Testing file upload...');
    try {
      // Create a test file
      const testFilePath = path.join(__dirname, 'test-file.txt');
      fs.writeFileSync(testFilePath, 'This is a test file for portfolio upload functionality.');
      
      const formData = new FormData();
      formData.append('file', fs.createReadStream(testFilePath));
      formData.append('companyId', companyId);
      formData.append('fileType', 'test_document');
      formData.append('description', 'Test file for portfolio upload');

      const fileResponse = await fetch(`${baseUrl}/api/portfolio/upload-file`, {
        method: 'POST',
        body: formData
      });
      
      const fileResult = await fileResponse.json();
      if (fileResponse.ok) {
        console.log(`✅ File uploaded successfully: ${fileResult.fileId}`);
      } else {
        console.log(`❌ File upload failed: ${fileResult.error}`);
      }
      
      // Clean up test file
      fs.unlinkSync(testFilePath);
    } catch (error) {
      console.log(`❌ File upload error: ${error.message}`);
    }

    // Test 4: Test fetching emails
    console.log('\n4. Testing email retrieval...');
    try {
      const emailsResponse = await fetch(`${baseUrl}/api/portfolio/forward-email?companyId=${companyId}`);
      const emailsResult = await emailsResponse.json();
      
      if (emailsResponse.ok) {
        console.log(`✅ Retrieved ${emailsResult.emails.length} emails`);
      } else {
        console.log(`❌ Email retrieval failed: ${emailsResult.error}`);
      }
    } catch (error) {
      console.log(`❌ Email retrieval error: ${error.message}`);
    }

    // Test 5: Test fetching files
    console.log('\n5. Testing file retrieval...');
    try {
      const filesResponse = await fetch(`${baseUrl}/api/portfolio/upload-file?companyId=${companyId}`);
      const filesResult = await filesResponse.json();
      
      if (filesResponse.ok) {
        console.log(`✅ Retrieved ${filesResult.files.length} files`);
      } else {
        console.log(`❌ File retrieval failed: ${filesResult.error}`);
      }
    } catch (error) {
      console.log(`❌ File retrieval error: ${error.message}`);
    }

    console.log('\n🎉 Portfolio features testing completed!');
    
  } catch (error) {
    console.log(`❌ Test failed: ${error.message}`);
  }
}

// Run the test
testPortfolioFeatures().catch(console.error);






