'use client';

export default function ChromeExtensionPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-8 pt-24">
      
      <div className="max-w-4xl mx-auto text-center space-y-8">
        <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
          Chrome Extension
        </h1>
        
        <p className="text-xl text-slate-400 max-w-2xl mx-auto">
          Enhance your browsing experience with the MV Intelligence companion. Capture data, analyze companies, and sync with your knowledge graph in one click.
        </p>

        <div className="p-8 rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm shadow-xl mt-12">
            <div className="animate-pulse space-y-4">
                <div className="h-8 bg-slate-800 rounded w-1/3 mx-auto"></div>
                <div className="h-4 bg-slate-800 rounded w-1/2 mx-auto"></div>
                <div className="h-64 bg-slate-800/50 rounded-xl mt-8 flex items-center justify-center border-2 border-dashed border-slate-800">
                    <span className="text-slate-600 font-mono">Extension Preview / Download Area</span>
                </div>
            </div>
            
            <div className="mt-8 flex justify-center gap-4">
                <button disabled className="px-6 py-3 bg-blue-600/20 text-blue-400 border border-blue-600/50 rounded-lg cursor-not-allowed">
                    Coming Soon
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}

