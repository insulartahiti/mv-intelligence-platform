const axios = require('axios');
const cheerio = require('cheerio');

class WebScraper {
  async fetchPageContent(url, maxLength = 8000) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'MV-Intelligence-Bot/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      
      const $ = cheerio.load(response.data);
      
      // Remove scripts, styles, nav, footer
      $('script, style, nav, footer, header, noscript, iframe').remove();
      
      // Extract main content
      const mainContent = $('main, article, .content, #content, body').text();
      
      // Clean and truncate
      const cleaned = mainContent
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, maxLength);
        
      return cleaned;
    } catch (error) {
      // Don't log full error for 404/timeout to reduce noise, just message
      console.warn(`Failed to fetch ${url}: ${error.message}`);
      return null;
    }
  }
}

module.exports = WebScraper;

