'use client';

import { useState } from 'react';
import { Button, Card } from './ui/GlassComponents';

export default function BrowserTranslucency() {
  const [isTranslucent, setIsTranslucent] = useState(false);

  const toggleTranslucency = () => {
    setIsTranslucent(!isTranslucent);
    
    // Apply translucency to the document body
    if (!isTranslucent) {
      document.body.classList.add('browser-translucent');
      document.documentElement.style.setProperty('--glass-bg', 'rgba(0, 0, 0, 0.3)');
      document.documentElement.style.setProperty('--glass-blur', 'blur(20px) saturate(1.4)');
    } else {
      document.body.classList.remove('browser-translucent');
      document.documentElement.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.08)');
      document.documentElement.style.setProperty('--glass-blur', 'blur(24px) saturate(1.4)');
    }
  };

  return (
    <div className="p-6">
      <Card className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-semibold text-white mb-4">
          Browser Window Translucency
        </h2>
        
        <p className="text-white/70 mb-6">
          This demonstrates how to make the browser window itself translucent using CSS backdrop filters.
          Click the button below to toggle the effect.
        </p>

        <div className="space-y-4">
          <Button 
            variant="primary" 
            onClick={toggleTranslucency}
            className="w-full"
          >
            {isTranslucent ? 'Disable' : 'Enable'} Window Translucency
          </Button>

          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <h3 className="text-lg font-medium text-white mb-2">How it works:</h3>
            <ul className="text-white/70 text-sm space-y-1">
              <li>• Uses CSS <code>backdrop-filter: blur()</code> for translucency</li>
              <li>• Applies to the entire document body</li>
              <li>• Works best with modern browsers that support backdrop-filter</li>
              <li>• Can be customized with different blur amounts and colors</li>
            </ul>
          </div>

          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <h3 className="text-lg font-medium text-white mb-2">Browser Support:</h3>
            <ul className="text-white/70 text-sm space-y-1">
              <li>✅ Chrome 76+ (with flags)</li>
              <li>✅ Safari 9+</li>
              <li>✅ Firefox 103+</li>
              <li>✅ Edge 79+</li>
            </ul>
          </div>

          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <h3 className="text-lg font-medium text-white mb-2">CSS Implementation:</h3>
            <pre className="text-xs text-white/60 bg-black/20 p-3 rounded overflow-x-auto">
{`.browser-translucent {
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}`}
            </pre>
          </div>
        </div>
      </Card>
    </div>
  );
}
