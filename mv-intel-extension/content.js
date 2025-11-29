(function(){
  let injected = true;

  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
  function isDocsend(){ return location.hostname.includes('docsend.com'); }
  function isFigma(){ return location.hostname.includes('figma.com'); }
  function isPitch(){ return location.hostname.includes('pitch.com'); }
  function isNotion(){ return location.hostname.includes('notion.so') || location.hostname.endsWith('.notion.site'); }

  async function tryUnlock(gate){
    if (!gate) return { tried:false };
    const { email, passcode } = gate;
    // DocSend passcode/email gate
    try {
      const emailInput = document.querySelector('input[type="email"], input[name="email"]');
      const passInput = document.querySelector('input[type="password"], input[name="passcode"]');
      const submit = document.querySelector('button[type="submit"], button[data-test="submit"], input[type="submit"]');
      if (email && emailInput) { emailInput.value = email; emailInput.dispatchEvent(new Event('input', { bubbles:true })); }
      if (passcode && passInput) { passInput.value = passcode; passInput.dispatchEvent(new Event('input', { bubbles:true })); }
      if (submit && (email || passcode)) { submit.click(); await sleep(1200); }
    } catch {}
    return { tried: true };
  }

  function sendKey(key){
    const e1 = new KeyboardEvent('keydown', { key, bubbles:true });
    const e2 = new KeyboardEvent('keyup', { key, bubbles:true });
    document.activeElement?.dispatchEvent(e1); document.activeElement?.dispatchEvent(e2);
    document.body.dispatchEvent(e1); document.body.dispatchEvent(e2);
  }

  // Enhanced error handling and retry mechanism
  async function retryNavigation(hostname, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Navigation attempt ${attempt}/${maxRetries} for ${hostname}`);
        const result = await attemptNavigation(hostname);
        
        if (result && result.moved) {
          console.log(`✅ Navigation successful on attempt ${attempt}`);
          return result;
        }
        
        if (attempt < maxRetries) {
          console.log(`⚠️ Attempt ${attempt} failed, retrying in ${attempt * 500}ms...`);
          await sleep(attempt * 500); // Progressive delay
        }
      } catch (error) {
        console.log(`❌ Navigation attempt ${attempt} error:`, error);
        if (attempt === maxRetries) {
          throw error;
        }
        await sleep(attempt * 500);
      }
    }
    
    console.log(`❌ All ${maxRetries} navigation attempts failed`);
    return { moved: false, method: 'retry_exhausted', attempts: maxRetries };
  }

  async function attemptNavigation(hostname) {
    console.log('🔄 Attempting to navigate to next slide on:', hostname);
    
    // DocSend - Enhanced navigation with multiple detection methods
    if (hostname.includes('docsend.com')) {
      console.log('📄 DocSend detected, trying enhanced navigation methods...');
      
      // Method 1: Try comprehensive button selectors
      const nextBtnSelectors = [
        '[data-testid="next"]',
        'button[aria-label="Next"]',
        'button[aria-label="next"]', 
        '.next-button',
        '[class*="next"]',
        '[class*="Next"]',
        'button[title="Next"]',
        'button[title="next"]',
        '.navigation-button[data-direction="next"]',
        '.slide-nav-next',
        '.presentation-next',
        'button:contains("Next")',
        'button:contains("→")',
        'button:contains(">")',
        '[role="button"][aria-label*="next"]',
        '[role="button"][aria-label*="Next"]'
      ];
      
      let nextBtn = null;
      for (const selector of nextBtnSelectors) {
        nextBtn = document.querySelector(selector);
        if (nextBtn && nextBtn.offsetParent !== null) { // Check if visible
          console.log(`✅ Found DocSend next button with selector: ${selector}`);
          break;
        }
      }
      
      if (nextBtn) {
        try {
          // Ensure button is clickable
          nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(200);
          
          // Try multiple click methods
          if (nextBtn.click) {
            nextBtn.click();
            console.log('✅ Clicked DocSend next button');
          } else {
            // Fallback click methods
            const clickEvent = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true
            });
            nextBtn.dispatchEvent(clickEvent);
            console.log('✅ Dispatched click event to DocSend button');
          }
          
          await sleep(600); // Increased wait time for DocSend
          return { moved: true, method: 'docsend_button' };
        } catch (clickError) {
          console.log('⚠️ Button click failed, trying alternative methods:', clickError);
        }
      }
      
      // Method 2: Try keyboard navigation with multiple keys
      console.log('➡️ Trying keyboard navigation for DocSend...');
      const keysToTry = ['ArrowRight', 'ArrowDown', 'Space', 'PageDown'];
      
      for (const key of keysToTry) {
        console.log(`🔑 Trying ${key} key...`);
        sendKey(key);
        await sleep(300);
        
        // Check if slide changed by looking for common indicators
        const slideIndicators = document.querySelectorAll('[data-slide], .slide, .page, [class*="slide"]');
        if (slideIndicators.length > 0) {
          console.log(`✅ ${key} key navigation successful`);
          return { moved: true, method: `docsend_${key.toLowerCase()}` };
        }
      }
      
      // Method 3: Try clicking on slide area to advance
      console.log('🖱️ Trying slide area click for DocSend...');
      const slideArea = document.querySelector('.slide-container, .presentation-slide, .slide, [class*="slide"]');
      if (slideArea) {
        slideArea.click();
        await sleep(400);
        return { moved: true, method: 'docsend_slide_click' };
      }
      
      // Method 4: Try programmatic navigation if available
      console.log('🔧 Trying programmatic navigation for DocSend...');
      if (window.nextSlide && typeof window.nextSlide === 'function') {
        window.nextSlide();
        await sleep(400);
        return { moved: true, method: 'docsend_programmatic' };
      }
      
      console.log('❌ All DocSend navigation methods failed');
      return { moved: false, method: 'docsend_failed' };
    }
    
    // Pitch - Enhanced navigation with comprehensive detection
    if (hostname.includes('pitch.com')) {
      console.log('🎯 Pitch detected, trying enhanced navigation methods...');
      
      // Method 1: Try comprehensive button selectors for Pitch
      const nextBtnSelectors = [
        '[data-test="player-next-button"]',
        '[data-testid="next"]',
        '.next-button',
        '[class*="next"]',
        '[class*="Next"]',
        'button[aria-label="Next"]',
        'button[aria-label="next"]',
        'button[title="Next"]',
        'button[title="next"]',
        '.presentation-next',
        '.slide-next',
        '.deck-next',
        '.pitch-next',
        '[role="button"][aria-label*="next"]',
        '[role="button"][aria-label*="Next"]',
        '.navigation-next',
        '.control-next',
        'button:contains("Next")',
        'button:contains("→")',
        'button:contains(">")',
        '.arrow-right',
        '.arrow-next'
      ];
      
      let nextBtn = null;
      for (const selector of nextBtnSelectors) {
        nextBtn = document.querySelector(selector);
        if (nextBtn && nextBtn.offsetParent !== null) { // Check if visible
          console.log(`✅ Found Pitch next button with selector: ${selector}`);
          break;
        }
      }
      
      if (nextBtn) {
        try {
          // Ensure button is clickable and in view
          nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(200);
          
          // Try multiple click methods
          if (nextBtn.click) {
            nextBtn.click();
            console.log('✅ Clicked Pitch next button');
          } else {
            // Fallback click methods
            const clickEvent = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true
            });
            nextBtn.dispatchEvent(clickEvent);
            console.log('✅ Dispatched click event to Pitch button');
          }
          
          await sleep(500); // Wait for Pitch transition
          return { moved: true, method: 'pitch_button' };
        } catch (clickError) {
          console.log('⚠️ Pitch button click failed, trying alternative methods:', clickError);
        }
      }
      
      // Method 2: Try keyboard navigation with multiple keys
      console.log('➡️ Trying keyboard navigation for Pitch...');
      const keysToTry = ['ArrowRight', 'ArrowDown', 'Space', 'PageDown', 'n', 'N'];
      
      for (const key of keysToTry) {
        console.log(`🔑 Trying ${key} key...`);
        sendKey(key);
        await sleep(300);
        
        // Check if slide changed by looking for common indicators
        const slideIndicators = document.querySelectorAll('[data-slide], .slide, .page, [class*="slide"], [class*="deck"]');
        if (slideIndicators.length > 0) {
          console.log(`✅ ${key} key navigation successful`);
          return { moved: true, method: `pitch_${key.toLowerCase()}` };
        }
      }
      
      // Method 3: Try clicking on presentation area
      console.log('🖱️ Trying presentation area click for Pitch...');
      const presentationArea = document.querySelector('.presentation, .deck, .slide-container, .pitch-deck, [class*="presentation"]');
      if (presentationArea) {
        presentationArea.click();
        await sleep(400);
        return { moved: true, method: 'pitch_area_click' };
      }
      
      // Method 4: Try programmatic navigation if available
      console.log('🔧 Trying programmatic navigation for Pitch...');
      if (window.nextSlide && typeof window.nextSlide === 'function') {
        window.nextSlide();
        await sleep(400);
        return { moved: true, method: 'pitch_programmatic' };
      }
      
      // Method 5: Try swiping gesture simulation
      console.log('👆 Trying swipe gesture simulation for Pitch...');
      const presentationContainer = document.querySelector('.presentation, .deck, .slide-container');
      if (presentationContainer) {
        const touchStart = new TouchEvent('touchstart', {
          touches: [new Touch({
            identifier: 1,
            target: presentationContainer,
            clientX: presentationContainer.offsetWidth * 0.8,
            clientY: presentationContainer.offsetHeight * 0.5
          })]
        });
        
        const touchEnd = new TouchEvent('touchend', {
          touches: [new Touch({
            identifier: 1,
            target: presentationContainer,
            clientX: presentationContainer.offsetWidth * 0.2,
            clientY: presentationContainer.offsetHeight * 0.5
          })]
        });
        
        presentationContainer.dispatchEvent(touchStart);
        await sleep(100);
        presentationContainer.dispatchEvent(touchEnd);
        await sleep(400);
        return { moved: true, method: 'pitch_swipe' };
      }
      
      console.log('❌ All Pitch navigation methods failed');
      return { moved: false, method: 'pitch_failed' };
    }
    
    // Google Slides
    if (hostname.includes('docs.google.com') && location.pathname.includes('/presentation/')) {
      console.log('📊 Google Slides detected...');
      
      // Method 1: Try next button
      const nextBtn = document.querySelector('[aria-label="Next slide"], .next-slide, [class*="next"]');
      if (nextBtn) {
        console.log('✅ Found Google Slides next button, clicking...');
        nextBtn.click();
        await sleep(400); // Reduced from 800ms
        return { moved: true, method: 'google_slides_button' };
      }
      
      // Method 2: Arrow keys
      sendKey('ArrowRight');
      await sleep(400); // Reduced from 800ms
        return { moved: true, method: 'google_slides_arrow' };
    }
    
    // Figma - Handle both regular files and presentation decks
    if (hostname.includes('figma.com')) {
      console.log('🎨 Figma detected...');
      
      // Check if this is a Figma presentation deck
      if (location.pathname.includes('/deck/')) {
        console.log('📊 Figma presentation deck detected, using deck-specific navigation...');
        
        // Store current URL for comparison
        const currentUrl = location.href;
        
        // Method 1: Try deck navigation buttons (fastest)
        const deckNextBtn = document.querySelector('[data-testid="next"], [aria-label*="next"], [aria-label*="Next"], .next, [class*="next"]');
        if (deckNextBtn) {
          console.log('✅ Found Figma deck next button, clicking...');
          deckNextBtn.click();
          await sleep(500); // Wait for navigation
          
          // Check if URL changed (indicates successful navigation)
          if (location.href !== currentUrl) {
            console.log('✅ Navigation successful - URL changed');
            return { moved: true, method: 'figma_deck_button' };
          } else {
            console.log('❌ Navigation failed - URL unchanged, likely at end');
            return { moved: false, method: 'figma_deck_end' };
          }
        }
        
        // Method 2: Try deck-specific keyboard shortcuts
        console.log('➡️ Trying deck navigation shortcuts...');
        sendKey('ArrowRight');
        await sleep(500); // Wait for navigation
        
        // Check if URL changed
        if (location.href !== currentUrl) {
          console.log('✅ Arrow key navigation successful');
          return { moved: true, method: 'figma_deck_arrow' };
        }
        
        // Method 3: Try spacebar (common for presentations)
        console.log('🔄 Trying spacebar navigation...');
        sendKey(' ');
        await sleep(500); // Wait for navigation
        
        // Check if URL changed
        if (location.href !== currentUrl) {
          console.log('✅ Spacebar navigation successful');
          return { moved: true, method: 'figma_deck_space' };
        }
        
        // All navigation methods failed - we're at the end
        console.log('❌ All navigation methods failed - confirmed end of presentation');
        return { moved: false, method: 'figma_deck_end' };
      } else {
        // Regular Figma file
        console.log('📁 Regular Figma file detected...');
        const currentUrl = location.href;
        sendKey('ArrowRight');
        await sleep(600);
        
        if (location.href !== currentUrl) {
          return { moved: true, method: 'figma_arrow' };
        } else {
          return { moved: false, method: 'figma_end' };
        }
      }
    }
    
    // Notion - Advanced vertical scrolling with multiple strategies
    if (hostname.includes('notion.so') || hostname.endsWith('.notion.site')) {
      console.log('📝 Notion detected, implementing advanced scrolling...');
      
      // Method 1: Smart scrolling based on content structure
      const notionContent = document.querySelector('.notion-page-content, .notion-page, [data-block-id], .notion-scroller');
      if (notionContent) {
        console.log('🎯 Found Notion content container, using smart scrolling...');
        
        // Get current scroll position
        const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
        const viewportHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        
        // Calculate optimal scroll distance based on content
        let scrollDistance = viewportHeight * 0.8; // Default 80% of viewport
        
        // Check if we're near the bottom
        if (currentScroll + viewportHeight >= documentHeight - 100) {
          console.log('📄 Near bottom of Notion page, scrolling to top...');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          await sleep(1000);
          return { moved: true, method: 'notion_scroll_to_top' };
        }
        
        // Check for Notion blocks to scroll by block height
        const blocks = document.querySelectorAll('[data-block-id]');
        if (blocks.length > 0) {
          // Find the first visible block
          let firstVisibleBlock = null;
          for (const block of blocks) {
            const rect = block.getBoundingClientRect();
            if (rect.top >= 0 && rect.top <= viewportHeight) {
              firstVisibleBlock = block;
              break;
            }
          }
          
          if (firstVisibleBlock) {
            // Scroll to show next few blocks
            const nextBlocks = Array.from(blocks).slice(
              Array.from(blocks).indexOf(firstVisibleBlock) + 1,
              Array.from(blocks).indexOf(firstVisibleBlock) + 4
            );
            
            if (nextBlocks.length > 0) {
              nextBlocks[nextBlocks.length - 1].scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start',
                inline: 'nearest'
              });
              await sleep(800);
              return { moved: true, method: 'notion_block_scroll' };
            }
          }
        }
        
        // Fallback to percentage-based scrolling
        window.scrollBy({ top: scrollDistance, behavior: 'smooth' });
        await sleep(800);
        return { moved: true, method: 'notion_smart_scroll' };
      }
      
      // Method 2: Progressive scrolling with multiple steps
      console.log('📊 Using progressive scrolling for Notion...');
      const scrollSteps = [0.3, 0.5, 0.7, 0.9]; // Progressive scroll distances
      
      for (let i = 0; i < scrollSteps.length; i++) {
        const scrollDistance = window.innerHeight * scrollSteps[i];
        console.log(`📈 Scrolling step ${i + 1}/${scrollSteps.length}: ${scrollDistance}px`);
        
        window.scrollBy({ top: scrollDistance, behavior: 'smooth' });
        await sleep(400); // Shorter wait between steps
        
        // Check if we've reached the bottom
        const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
        const documentHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.innerHeight;
        
        if (currentScroll + viewportHeight >= documentHeight - 50) {
          console.log('📄 Reached bottom of Notion page');
          return { moved: true, method: 'notion_progressive_scroll_complete' };
        }
      }
      
      // Method 3: Keyboard-based scrolling
      console.log('⌨️ Trying keyboard-based scrolling for Notion...');
      const keysToTry = ['PageDown', 'ArrowDown', 'Space'];
      
      for (const key of keysToTry) {
        console.log(`🔑 Trying ${key} key for Notion scrolling...`);
        sendKey(key);
        await sleep(300);
        
        // Check if scroll position changed
        const newScroll = window.pageYOffset || document.documentElement.scrollTop;
        if (newScroll > currentScroll) {
          console.log(`✅ ${key} key scrolling successful`);
          return { moved: true, method: `notion_${key.toLowerCase()}` };
        }
      }
      
      // Method 4: Mouse wheel simulation
      console.log('🖱️ Trying mouse wheel simulation for Notion...');
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: 1000, // Large scroll amount
        deltaMode: 0,
        bubbles: true,
        cancelable: true
      });
      
      document.dispatchEvent(wheelEvent);
      await sleep(600);
      
      // Method 5: Scroll to specific elements
      console.log('🎯 Trying element-based scrolling for Notion...');
      const scrollableElements = document.querySelectorAll('.notion-scroller, .notion-page-content, [data-block-id]');
      
      for (const element of scrollableElements) {
        if (element.scrollHeight > element.clientHeight) {
          element.scrollTop += element.clientHeight * 0.8;
          await sleep(600);
          return { moved: true, method: 'notion_element_scroll' };
        }
      }
      
      // Fallback: Basic scrolling
      console.log('🔄 Using fallback scrolling for Notion...');
      window.scrollBy({ top: window.innerHeight * 0.9, behavior: 'smooth' });
      await sleep(800);
      return { moved: true, method: 'notion_fallback_scroll' };
    }
    
    // Universal fallback - Enhanced navigation for unknown platforms
    console.log('🌐 Universal navigation, trying enhanced methods...');
    
    // Method 1: Comprehensive button detection
    console.log('🔍 Scanning for navigation buttons...');
    const buttonSelectors = [
      'button[aria-label*="next"]',
      'button[aria-label*="Next"]',
      'button[title*="next"]',
      'button[title*="Next"]',
      '.next',
      '[class*="next"]',
      '[class*="Next"]',
      '[data-test*="next"]',
      '[data-testid*="next"]',
      '[data-testid*="Next"]',
      '[role="button"][aria-label*="next"]',
      '[role="button"][aria-label*="Next"]',
      'button:contains("Next")',
      'button:contains("→")',
      'button:contains(">")',
      '.arrow-right',
      '.arrow-next',
      '.navigation-next',
      '.control-next',
      '.slide-next',
      '.page-next',
      '.presentation-next'
    ];
    
    let foundButtons = [];
    for (const selector of buttonSelectors) {
      const buttons = document.querySelectorAll(selector);
      buttons.forEach(btn => {
        if (btn.offsetParent !== null) { // Check if visible
          foundButtons.push({ element: btn, selector: selector });
        }
      });
    }
    
    if (foundButtons.length > 0) {
      console.log(`🎯 Found ${foundButtons.length} potential navigation buttons`);
      
      // Try clicking buttons in order of preference
      for (let i = 0; i < Math.min(foundButtons.length, 3); i++) {
        const { element: btn, selector } = foundButtons[i];
        try {
          console.log(`🖱️ Trying button ${i + 1}/${Math.min(foundButtons.length, 3)} with selector: ${selector}`);
          
          // Ensure button is clickable
          btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(200);
          
          // Try multiple click methods
          if (btn.click) {
            btn.click();
          } else {
            const clickEvent = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true
            });
            btn.dispatchEvent(clickEvent);
          }
          
          await sleep(500);
          console.log(`✅ Button ${i + 1} clicked successfully`);
          return { moved: true, method: 'universal_button', buttonIndex: i + 1, totalButtons: foundButtons.length };
        } catch (clickError) {
          console.log(`⚠️ Button ${i + 1} click failed:`, clickError);
        }
      }
    }
    
    // Method 2: Enhanced keyboard navigation
    console.log('⌨️ Trying enhanced keyboard navigation...');
    const keysToTry = [
      { key: 'ArrowRight', description: 'Right arrow' },
      { key: 'ArrowDown', description: 'Down arrow' },
      { key: 'Space', description: 'Spacebar' },
      { key: 'PageDown', description: 'Page Down' },
      { key: 'n', description: 'N key' },
      { key: 'N', description: 'N key (shift)' },
      { key: 'Enter', description: 'Enter key' },
      { key: 'Tab', description: 'Tab key' }
    ];
    
    for (const { key, description } of keysToTry) {
      console.log(`🔑 Trying ${description} (${key})...`);
      sendKey(key);
      await sleep(300);
      
      // Check for visual changes that might indicate navigation
      const hasSlideElements = document.querySelectorAll('[data-slide], .slide, .page, [class*="slide"], [class*="page"]').length > 0;
      if (hasSlideElements) {
        console.log(`✅ ${description} navigation successful`);
        return { moved: true, method: `universal_${key.toLowerCase()}` };
      }
    }
    
    // Method 3: Click-based navigation on content areas
    console.log('🖱️ Trying content area clicking...');
    const contentSelectors = [
      '.slide',
      '.page',
      '.presentation',
      '.deck',
      '.content',
      '.main',
      '.container',
      '[class*="slide"]',
      '[class*="page"]',
      '[class*="presentation"]',
      '[class*="deck"]'
    ];
    
    for (const selector of contentSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`🎯 Found ${elements.length} content elements with selector: ${selector}`);
        elements[0].click();
        await sleep(400);
        return { moved: true, method: 'universal_content_click', selector: selector };
      }
    }
    
    // Method 4: Touch/swipe gesture simulation
    console.log('👆 Trying touch gesture simulation...');
    const touchableElements = document.querySelectorAll('.slide, .page, .presentation, .deck, .content, .main');
    
    for (const element of touchableElements) {
      if (element.offsetParent !== null) {
        try {
          const touchStart = new TouchEvent('touchstart', {
            touches: [new Touch({
              identifier: 1,
              target: element,
              clientX: element.offsetWidth * 0.8,
              clientY: element.offsetHeight * 0.5
            })]
          });
          
          const touchEnd = new TouchEvent('touchend', {
            touches: [new Touch({
              identifier: 1,
              target: element,
              clientX: element.offsetWidth * 0.2,
              clientY: element.offsetHeight * 0.5
            })]
          });
          
          element.dispatchEvent(touchStart);
          await sleep(100);
          element.dispatchEvent(touchEnd);
          await sleep(400);
          
          console.log('✅ Touch gesture simulation successful');
          return { moved: true, method: 'universal_touch_swipe' };
        } catch (touchError) {
          console.log('⚠️ Touch gesture failed:', touchError);
        }
      }
    }
    
    // Method 5: Programmatic navigation detection
    console.log('🔧 Trying programmatic navigation...');
    const programmaticMethods = [
      'nextSlide',
      'nextPage',
      'next',
      'advance',
      'goNext',
      'navigateNext'
    ];
    
    for (const method of programmaticMethods) {
      if (window[method] && typeof window[method] === 'function') {
        try {
          console.log(`🔧 Found programmatic method: ${method}`);
          window[method]();
          await sleep(400);
          return { moved: true, method: `universal_${method}` };
        } catch (progError) {
          console.log(`⚠️ Programmatic method ${method} failed:`, progError);
        }
      }
    }
    
    // Method 6: URL-based navigation (for single-page apps)
    console.log('🌐 Trying URL-based navigation...');
    const currentUrl = location.href;
    const urlParams = new URLSearchParams(location.search);
    
    // Try common URL parameters for slide/page navigation
    const urlParamsToTry = ['slide', 'page', 'step', 'index', 'pos'];
    for (const param of urlParamsToTry) {
      if (urlParams.has(param)) {
        const currentValue = parseInt(urlParams.get(param)) || 0;
        const newValue = currentValue + 1;
        
        urlParams.set(param, newValue.toString());
        const newUrl = `${location.origin}${location.pathname}?${urlParams.toString()}`;
        
        console.log(`🔗 Trying URL navigation: ${param}=${newValue}`);
        history.pushState({}, '', newUrl);
        await sleep(400);
        return { moved: true, method: `universal_url_${param}` };
      }
    }
    
    // Method 7: Scroll-based navigation (for vertical presentations)
    console.log('📜 Trying scroll-based navigation...');
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
    const viewportHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    
    if (currentScroll + viewportHeight < documentHeight - 100) {
      // Not at bottom, scroll down
      window.scrollBy({ top: viewportHeight * 0.8, behavior: 'smooth' });
      await sleep(600);
      return { moved: true, method: 'universal_scroll_down' };
    } else {
      // At bottom, scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await sleep(600);
      return { moved: true, method: 'universal_scroll_to_top' };
    }
    
    // Final fallback
    console.log('🔄 All universal navigation methods attempted');
    return { moved: false, method: 'universal_failed' };
  }

  // Main nextSlide function with retry mechanism
  async function nextSlide(){
    const hostname = location.hostname;
    console.log('🔄 Starting enhanced navigation with retry mechanism for:', hostname);
    
    // Use retry mechanism for robust navigation
    return await retryNavigation(hostname, 3);
  }

  // Enhanced debugging and error reporting
  function logNavigationAttempt(platform, method, success, details = {}) {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      platform,
      method,
      success,
      url: location.href,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      scrollPosition: {
        x: window.pageXOffset,
        y: window.pageYOffset
      },
      details
    };
    
    console.log(`📊 Navigation Log:`, logData);
    
    // Store in localStorage for debugging
    try {
      const existingLogs = JSON.parse(localStorage.getItem('mv-navigation-logs') || '[]');
      existingLogs.push(logData);
      
      // Keep only last 50 logs
      if (existingLogs.length > 50) {
        existingLogs.splice(0, existingLogs.length - 50);
      }
      
      localStorage.setItem('mv-navigation-logs', JSON.stringify(existingLogs));
    } catch (error) {
      console.log('⚠️ Failed to store navigation log:', error);
    }
  }

  // Enhanced element detection with better error handling
  function findClickableElement(selectors, context = document) {
    for (const selector of selectors) {
      try {
        const elements = context.querySelectorAll(selector);
        for (const element of elements) {
          if (element.offsetParent !== null && !element.disabled) {
            return element;
          }
        }
      } catch (error) {
        console.log(`⚠️ Selector error for "${selector}":`, error);
      }
    }
    return null;
  }

  // Safe click function with multiple fallback methods
  async function safeClick(element, description = 'element') {
    if (!element) {
      throw new Error(`Element not found for ${description}`);
    }

    try {
      // Method 1: Standard click
      if (element.click && typeof element.click === 'function') {
        element.click();
        console.log(`✅ Standard click successful for ${description}`);
        return true;
      }
    } catch (error) {
      console.log(`⚠️ Standard click failed for ${description}:`, error);
    }

    try {
      // Method 2: Mouse event simulation
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: element.offsetLeft + element.offsetWidth / 2,
        clientY: element.offsetTop + element.offsetHeight / 2
      });
      
      element.dispatchEvent(clickEvent);
      console.log(`✅ Mouse event click successful for ${description}`);
      return true;
    } catch (error) {
      console.log(`⚠️ Mouse event click failed for ${description}:`, error);
    }

    try {
      // Method 3: Touch event simulation
      const touchStart = new TouchEvent('touchstart', {
        touches: [new Touch({
          identifier: 1,
          target: element,
          clientX: element.offsetLeft + element.offsetWidth / 2,
          clientY: element.offsetTop + element.offsetHeight / 2
        })]
      });
      
      const touchEnd = new TouchEvent('touchend', {
        touches: [new Touch({
          identifier: 1,
          target: element,
          clientX: element.offsetLeft + element.offsetWidth / 2,
          clientY: element.offsetTop + element.offsetHeight / 2
        })]
      });
      
      element.dispatchEvent(touchStart);
      await sleep(50);
      element.dispatchEvent(touchEnd);
      console.log(`✅ Touch event click successful for ${description}`);
      return true;
    } catch (error) {
      console.log(`⚠️ Touch event click failed for ${description}:`, error);
    }

    throw new Error(`All click methods failed for ${description}`);
  }

  function prepForCapture(){
    // Attempt to hide cursors/overlays
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    return true;
  }
  
  function detectPresentationType() {
    const hostname = location.hostname;
    const pathname = location.pathname;
    
    if (hostname.includes('docsend.com')) {
      return {
        type: 'docsend',
        hasNavigation: !!document.querySelector('[data-testid="next"], button[aria-label="Next"], .next-button'),
        slideCount: document.querySelectorAll('[data-slide], .slide, .page').length || 'unknown'
      };
    }
    
    if (hostname.includes('pitch.com')) {
      return {
        type: 'pitch',
        hasNavigation: !!document.querySelector('[data-test="player-next-button"], .next-button'),
        slideCount: document.querySelectorAll('[data-slide], .slide, .page').length || 'unknown'
      };
    }
    
    if (hostname.includes('docs.google.com') && pathname.includes('/presentation/')) {
      return {
        type: 'google_slides',
        hasNavigation: !!document.querySelector('[aria-label="Next slide"]'),
        slideCount: 'unknown'
      };
    }
    
    if (hostname.includes('figma.com')) {
      const isDeck = pathname.includes('/deck/');
      return {
        type: isDeck ? 'figma_deck' : 'figma',
        hasNavigation: true,
        slideCount: isDeck ? 'deck_mode' : 'unknown',
        isPresentation: isDeck
      };
    }
    
    // Generic detection
    const hasSlideElements = document.querySelectorAll('[data-slide], .slide, .page, [class*="slide"], [class*="page"]').length > 0;
    const hasNextButtons = document.querySelectorAll('button[aria-label*="next"], button[aria-label*="Next"], .next, [class*="next"]').length > 0;
    
    return {
      type: 'generic',
      hasNavigation: hasSlideElements || hasNextButtons,
      slideCount: hasSlideElements ? document.querySelectorAll('[data-slide], .slide, .page, [class*="slide"], [class*="page"]').length : 'unknown'
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (!msg || !msg.type) return;
      if (msg.type === 'PING') return sendResponse({ ok:true, injected });
      if (msg.type === 'EXECUTE_UNLOCK') {
        const res = await tryUnlock(msg.gate || {});
        return sendResponse({ success:true, res });
      }
      if (msg.type === 'EXECUTE_CAPTURE') {
        // baseline single-shot capture is handled by background via tabs.captureVisibleTab
        return sendResponse({ success:true, ready:true });
      }
      if (msg.type === 'NEXT_SLIDE') {
        const m = await nextSlide(); return sendResponse({ success:true, ...m });
      }
      if (msg.type === 'PREP') {
        const ok = prepForCapture(); return sendResponse({ success: ok });
      }
      if (msg.type === 'GET_PAGE_INFO') {
        const presentationInfo = detectPresentationType();
        const info = {
          url: location.href,
          hostname: location.hostname,
          title: document.title,
          presentationType: presentationInfo.type,
          hasNavigation: presentationInfo.hasNavigation,
          estimatedSlideCount: presentationInfo.slideCount,
          hasNextButtons: !!document.querySelector('[data-testid="next"], button[aria-label="Next"], [data-test="player-next-button"]'),
          hasSlideIndicators: !!document.querySelector('[data-slide], .slide, .page, [class*="slide"], [class*="page"]'),
          bodyText: document.body.innerText.substring(0, 200) + '...'
        };
        console.log('📄 Page info detected:', info);
        return sendResponse({ success: true, info });
      }
    })();
    return true;
  });

  // ============================================================================
  // MV INTELLIGENCE WEBAPP INTEGRATION
  // ============================================================================
  
  // Report extension status to webapp
  function reportStatusToWebapp() {
    const status = {
      source: 'mv-extension',
      type: 'status',
      payload: {
        version: '1.0.0', // Update this to your actual version
        permissions: ['activeTab', 'clipboardRead', 'storage'], // Your actual permissions
        features: ['slide-capture', 'deck-analysis', 'affinity-integration', 'presentation-detection'],
        status: 'active',
        lastUpdate: new Date().toISOString(),
        presentationInfo: detectPresentationType(),
        pageInfo: {
          url: location.href,
          hostname: location.hostname,
          title: document.title,
          timestamp: new Date().toISOString()
        }
      }
    };

    // Method 1: PostMessage (most reliable)
    try {
      window.postMessage(status, '*');
      console.log('MV Extension: Status sent via PostMessage');
    } catch (error) {
      console.log('MV Extension: PostMessage failed:', error);
    }

    // Method 2: localStorage (for webapp detection)
    try {
      localStorage.setItem('mv-extension-data', JSON.stringify(status.payload));
      console.log('MV Extension: Status stored in localStorage');
    } catch (error) {
      console.log('MV Extension: localStorage failed:', error);
    }

    // Method 3: Global variable (for webapp detection)
    try {
      window.mvIntelExtension = status.payload;
      console.log('MV Extension: Status set as global variable');
    } catch (error) {
      console.log('MV Extension: Global variable failed:', error);
    }

    // Method 4: Custom event (alternative communication)
    try {
      window.dispatchEvent(new CustomEvent('extensionStatus', {
        detail: status
      }));
      console.log('MV Extension: Status sent via custom event');
    } catch (error) {
      console.log('MV Extension: Custom event failed:', error);
    }

    // Method 5: Inject status element into DOM - DISABLED
    // Removed to eliminate the MV Intelligence frame overlay
    // try {
    //   injectStatusElement(status.payload);
    // } catch (error) {
    //   console.log('MV Extension: DOM injection failed:', error);
    // }

    console.log('MV Extension: Status reported to webapp successfully');
  }

  // Remove any existing MV Intelligence status elements
  function removeStatusElements() {
    try {
      const existingElements = document.querySelectorAll('#mv-extension-status, [data-mv-extension="true"]');
      existingElements.forEach(element => {
        element.remove();
        console.log('MV Extension: Removed existing status element');
      });
    } catch (error) {
      console.log('MV Extension: Error removing status elements:', error);
    }
  }

  // Inject status element into DOM for webapp detection - DISABLED
  function injectStatusElement(statusData) {
    try {
      // Remove existing element if present
      const existing = document.getElementById('mv-extension-status');
      if (existing) {
        existing.remove();
      }
      
      // Create status element
      const statusElement = document.createElement('div');
      statusElement.id = 'mv-extension-status';
      statusElement.setAttribute('data-mv-extension', 'true');
      statusElement.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        z-index: 9999;
        pointer-events: none;
        opacity: 0.8;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      statusElement.innerHTML = `
        <div>🚀 MV Intelligence Extension</div>
        <div style="font-size: 10px; opacity: 0.7;">v${statusData.version}</div>
        <div style="font-size: 10px; opacity: 0.7;">${statusData.presentationInfo.type}</div>
      `;
      
      // Add to page
      document.body.appendChild(statusElement);
      
      // Auto-hide after 5 seconds
      setTimeout(() => {
        if (statusElement.parentNode) {
          statusElement.style.opacity = '0.3';
        }
      }, 5000);
      
      console.log('MV Extension: Status element injected into DOM');
    } catch (error) {
      console.log('MV Extension: Failed to inject status element:', error);
    }
  }

  // Listen for messages from webapp
  function setupWebappCommunication() {
    window.addEventListener('message', (event) => {
      if (event.data && event.data.target === 'mv-extension') {
        console.log('MV Extension: Received message from webapp:', event.data);
        
        switch (event.data.action) {
          case 'ping':
            // Respond to ping
            event.source.postMessage({
              source: 'mv-extension',
              type: 'pong',
              payload: {
                version: '1.0.0',
                status: 'active',
                timestamp: new Date().toISOString()
              }
            }, event.origin);
            console.log('MV Extension: Responded to ping');
            break;
            
          case 'getStatus':
            // Send current status
            event.source.postMessage({
              source: 'mv-extension',
              type: 'status',
              payload: {
                version: '1.0.0',
                permissions: ['activeTab', 'clipboardRead', 'storage'],
                features: ['slide-capture', 'deck-analysis', 'affinity-integration'],
                status: 'active',
                lastUpdate: new Date().toISOString(),
                presentationInfo: detectPresentationType()
              }
            }, event.origin);
            console.log('MV Extension: Status sent to webapp');
            break;
            
          case 'captureSlide':
            // Handle slide capture request from webapp
            console.log('MV Extension: Slide capture requested from webapp:', event.data.data);
            // You can integrate this with your existing capture logic
            break;
            
          default:
            console.log('MV Extension: Unknown action from webapp:', event.data.action);
        }
      }
    });
    
    console.log('MV Extension: Webapp communication setup complete');
  }

  // Initialize webapp integration
  function initWebappIntegration() {
    try {
      console.log('MV Extension: Initializing webapp integration...');
      
      // Remove any existing status elements first
      removeStatusElements();
      
      // Report initial status
      reportStatusToWebapp();
      
      // Setup communication
      setupWebappCommunication();
      
      // Report status every 30 seconds
      setInterval(reportStatusToWebapp, 30000);
      
      // Periodically remove any status elements that might appear
      setInterval(removeStatusElements, 5000);
      
      // Report status when page becomes visible
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          reportStatusToWebapp();
        }
      });
      
      // Report status when page gains focus
      window.addEventListener('focus', reportStatusToWebapp);
      
      console.log('MV Extension: Webapp integration initialized successfully');
      
    } catch (error) {
      console.error('MV Extension: Failed to initialize webapp integration:', error);
    }
  }

  // Start webapp integration after a short delay to ensure page is ready
  setTimeout(initWebappIntegration, 1000);

})();