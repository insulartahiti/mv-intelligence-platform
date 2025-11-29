document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('container');
  const statsEl = document.getElementById('stats');
  
  try {
    // Get data from storage
    const data = await chrome.storage.local.get(['capturedSlides', 'currentDeck']);
    const slides = data.capturedSlides || [];
    
    statsEl.textContent = `${slides.length} slides ready`;
    
    if (slides.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 40px; color: #6b7280;"><h1>No captured slides found</h1><p>Go back and capture some content first.</p></div>';
      return;
    }
    
    // Render slides
    slides.forEach((slide, index) => {
      const slideDiv = document.createElement('div');
      slideDiv.className = 'slide';
      
      const img = document.createElement('img');
      img.src = slide.screenshot;
      slideDiv.appendChild(img);
      
      // Info footer (hidden in print, visible in review)
      const info = document.createElement('div');
      info.className = 'slide-info no-print';
      info.innerHTML = `
        <span><strong>${index + 1}.</strong> ${slide.title || 'Untitled Slide'}</span>
        <span>${new Date(slide.timestamp).toLocaleTimeString()}</span>
      `;
      slideDiv.appendChild(info);
      
      container.appendChild(slideDiv);
    });
    
  } catch (error) {
    console.error('Error loading slides:', error);
    container.innerHTML = `<div style="color: red; padding: 20px;">Error loading slides: ${error.message}</div>`;
  }
});
