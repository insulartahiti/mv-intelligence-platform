(function(){
  const qs=(s)=>document.querySelector(s); 
  const status=qs('#status'), user=qs('#user');
  
  async function send(type, payload){ 
    return new Promise((resolve, reject) => {
      try {
        // Check if runtime is available
        if (!chrome.runtime || !chrome.runtime.sendMessage) {
          reject(new Error('Chrome runtime not available'));
          return;
        }
        
        // Add error handling for connection issues
        chrome.runtime.sendMessage({ type, ...payload }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('Runtime error:', chrome.runtime.lastError);
            // Provide more specific error messages
            let errorMessage = chrome.runtime.lastError.message;
            if (errorMessage.includes('Receiving end does not exist')) {
              errorMessage = 'Background script not ready. Please reload the extension.';
            } else if (errorMessage.includes('Could not establish connection')) {
              errorMessage = 'Extension connection failed. Try refreshing the page.';
            }
            reject(new Error(errorMessage));
            return;
          }
          resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  async function refreshUser(){ 
    try {
      const resp = await send('GET_USER'); 
      user.textContent = resp?.success ? `Signed in as ${resp.user.email}` : 'Not signed in'; 
      qs('#captureBtn').disabled = !resp?.success; 
    } catch (error) {
      console.warn('Failed to get user:', error);
      user.textContent = 'Connection error - check extension status';
      qs('#captureBtn').disabled = true;
    }
  }
  
  // Connection check
  async function checkConnection() {
    try {
      await send('PING');
      return true;
    } catch (error) {
      console.warn('Connection check failed:', error);
      return false;
    }
  }

  // Initialize popup
  async function initializePopup() {
    try {
      // Check connection first
      const isConnected = await checkConnection();
      if (!isConnected) {
        status.textContent = '⚠️ Extension not ready - please reload the extension';
        status.className = 'mv-status warning';
        return;
      }
      
      // Initialize user state
      await refreshUser();
      
      // Update status
      status.textContent = '✅ Extension ready';
      status.className = 'mv-status success';
      
    } catch (error) {
      console.error('Popup initialization failed:', error);
      status.textContent = '❌ Failed to initialize - check console for details';
      status.className = 'mv-status error';
    }
  }

  // Auth
  qs('#loginBtn').onclick = async ()=>{
    try {
      status.textContent='Signing in...'; 
      status.className = 'mv-status';
      
      const resp=await send('AUTHENTICATE',{ 
        credentials:{ 
          email:qs('#email').value, 
          password:qs('#password').value 
        }
      }); 
      
      if (resp?.success) {
        status.textContent = '✅ Signed in successfully';
        status.className = 'mv-status success';
      } else {
        status.textContent = `❌ Error: ${resp?.error||'unknown'}`;
        status.className = 'mv-status error';
      }
      
      await refreshUser(); 
    } catch (error) {
      console.error('Login failed:', error);
      status.textContent = `❌ Connection error: ${error.message}`;
      status.className = 'mv-status error';
    }
  };
  
  qs('#signOutBtn').onclick = async ()=>{
    await send('SIGN_OUT'); 
    status.textContent='Signed out'; 
    refreshUser(); 
  };
  
  qs('#testBtn').onclick = async ()=>{
    const r = await send('TEST'); 
    status.textContent = r?.success ? `OK (${r.status})` : `Error: ${r?.error||'unknown'}`; 
  };
  
  qs('#captureBtn').onclick = async ()=>{
    status.textContent='Capturing slides...';
    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
    const resp = await send('CAPTURE', {
      url: tab?.url, 
      platform:'UNIVERSAL', 
      multiSlide:true, 
      presentationInfo:{},
      gate: { 
        email: qs('#gateEmail').value || null, 
        passcode: qs('#gatePass').value || null, 
                     maxSlides: Number(qs('#maxSlides').value||50) 
      },
      company: { 
        name: qs('#companyName').value || null, 
        domain: qs('#companyDomain').value || null 
      }
    });
    
    if (resp?.success) {
      let statusText = `Demo mode: ${resp.slideCount} slides captured and combined into PDF!`;
      
      if (resp.slides) {
        const failedSlides = resp.slides.filter(s => !s.success).length;
        if (failedSlides > 0) {
          statusText += ` (${failedSlides} failed)`;
        }
      }
      
      if (resp.pdf?.success) {
        if (resp.pdf.type === 'html_with_images') {
          statusText += ` HTML file: ${resp.pdf.filename}`;
          
          // Show instructions for HTML to PDF conversion
          if (resp.pdf.instructions) {
            const instructionsDiv = document.createElement('div');
            instructionsDiv.style.cssText = 'margin-top: 10px; padding: 10px; background: #f0f8ff; border: 1px solid #0066cc; border-radius: 5px; font-size: 12px;';
            instructionsDiv.innerHTML = `
              <strong>📄 To create PDF with images:</strong><br>
              ${resp.pdf.instructions.map(step => `• ${step}`).join('<br>')}
            `;
            status.parentNode.insertBefore(instructionsDiv, status.nextSibling);
          }
        } else if (resp.pdf.type === 'pdf_with_images') {
          statusText += ` PDF with images: ${resp.pdf.filename}`;
        } else {
          statusText += ` Summary: ${resp.pdf.filename}`;
        }
      } else if (resp.pdf?.fallbackReason) {
        statusText += ` (PDF failed, using text summary: ${resp.pdf.filename})`;
      } else if (resp.pdf?.error) {
        statusText += ` PDF failed: ${resp.pdf.error}`;
      }
      
      status.textContent = statusText;
      
      // Show detailed results in console for debugging
      console.log('�� Capture Results:', resp);
      if (resp.details) {
        console.log('📊 Details:', resp.details);
      }
      
      // Hide copy logs button on success
      qs('#copyLogsBtn').style.display = 'none';
    } else {
      let errorText = `Error: ${resp?.error || 'unknown'}`;
      if (resp?.details) {
        errorText += ` - ${resp.details}`;
      }
      status.textContent = errorText;
      
      // Log detailed error for debugging
      console.error('❌ Capture Error:', resp);
      if (resp?.stack) {
        console.error('📚 Stack Trace:', resp.stack);
      }
      
      // Show copy logs button on error
      qs('#copyLogsBtn').style.display = 'block';
      qs('#copyLogsBtn').onclick = () => copyErrorLogs(resp);
    }
  };
  
  // Function to copy error logs to clipboard
  async function copyErrorLogs(errorResp) {
    try {
      let logText = `=== MV Intelligence Extension Error Log ===\n\n`;
      logText += `Timestamp: ${new Date().toISOString()}\n`;
      logText += `Error: ${errorResp.error || 'Unknown error'}\n`;
      
      if (errorResp.details) {
        logText += `Details: ${errorResp.details}\n`;
      }
      
      if (errorResp.stack) {
        logText += `Stack Trace:\n${errorResp.stack}\n`;
      }
      
      if (errorResp.timestamp) {
        logText += `Error Timestamp: ${errorResp.timestamp}\n`;
      }
      
      logText += `\n=== Extension Info ===\n`;
      logText += `Version: Demo Mode\n`;
      logText += `User Agent: ${navigator.userAgent}\n`;
      logText += `Platform: ${navigator.platform}\n`;
      
      await navigator.clipboard.writeText(logText);
      qs('#copyLogsBtn').textContent = '✅ Copied!';
      setTimeout(() => {
        qs('#copyLogsBtn').textContent = '📋 Copy Error Logs';
      }, 2000);
    } catch (error) {
      console.error('Failed to copy logs:', error);
      qs('#copyLogsBtn').textContent = '❌ Copy Failed';
      setTimeout(() => {
        qs('#copyLogsBtn').textContent = '�� Copy Error Logs';
      }, 2000);
    }
  }
  
  // Initialize popup when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePopup);
  } else {
    initializePopup();
  }
})();