'use client';

import { Card, Button, MetricTile, SearchInput } from './components/ui/GlassComponents';
import { useKeyboardShortcuts, useTouchGestures } from './components/ui/GlassComponents';


export default function Home() {
  // Enable native app features
  useKeyboardShortcuts();
  useTouchGestures();

  const handleQuickAction = (action: string) => {
    if (action === 'Chrome Extension') {
      window.location.href = '/extension-management';
      return;
    }
    
    // Show toast notification for quick actions
    const event = new CustomEvent('showToast', {
      detail: { message: `${action} action triggered!`, type: 'success' }
    });
    window.dispatchEvent(event);
  };

  return (
    <div className="min-h-screen app-backdrop">
      {/* Hero Section */}
      <section className="text-center py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
            MV Intelligence
          </h1>
          <p className="text-xl md:text-2xl text-onGlass-secondary mb-8 max-w-2xl mx-auto">
            AI-powered knowledge graph for investment intelligence and network analysis
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="primary" size="lg" onClick={() => window.location.href = '/knowledge-graph'}>
              Explore Knowledge Graph
            </Button>
            <Button variant="secondary" size="lg" onClick={() => handleQuickAction('Chrome Extension')}>
              Install Chrome Extension
            </Button>
          </div>
        </div>
      </section>



      {/* Quick Actions Grid */}
      <section className="px-6 pb-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12 text-onGlass">Key Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="text-center hover:scale-105 transition-transform duration-300">
              <div className="p-6">
                <h3 className="text-xl font-semibold mb-3 text-onGlass">Knowledge Graph</h3>
                <p className="text-onGlass-secondary mb-4">Interactive network visualization of companies, contacts, and relationships</p>
                <Button variant="primary" onClick={() => window.location.href = '/knowledge-graph'}>
                  Explore
                </Button>
              </div>
            </Card>

            <Card className="text-center hover:scale-105 transition-transform duration-300">
              <div className="p-6">
                <h3 className="text-xl font-semibold mb-3 text-onGlass">AI Intelligence</h3>
                <p className="text-onGlass-secondary mb-4">GPT-powered insights and analysis for investment decisions</p>
                <Button variant="primary" onClick={() => window.location.href = '/knowledge-graph'}>
                  Analyze
                </Button>
              </div>
            </Card>

            <Card className="text-center hover:scale-105 transition-transform duration-300">
              <div className="p-6">
                <h3 className="text-xl font-semibold mb-3 text-onGlass">Chrome Extension</h3>
                <p className="text-onGlass-secondary mb-4">Capture and analyze web content directly from your browser</p>
                <Button variant="primary" onClick={() => handleQuickAction('Chrome Extension')}>
                  Install
                </Button>
              </div>
            </Card>

            <Card className="text-center hover:scale-105 transition-transform duration-300">
              <div className="p-6">
                <h3 className="text-xl font-semibold mb-3 text-onGlass">Vector Search</h3>
                <p className="text-onGlass-secondary mb-4">Semantic search across all your data using AI embeddings</p>
                <Button variant="primary" onClick={() => window.location.href = '/semantic-search'}>
                  Search
                </Button>
              </div>
            </Card>

            <Card className="text-center hover:scale-105 transition-transform duration-300">
              <div className="p-6">
                <h3 className="text-xl font-semibold mb-3 text-onGlass">Network Analysis</h3>
                <p className="text-onGlass-secondary mb-4">Discover warm introduction paths and relationship insights</p>
                <Button variant="primary" onClick={() => window.location.href = '/knowledge-graph'}>
                  Discover
                </Button>
              </div>
            </Card>

            <Card className="text-center hover:scale-105 transition-transform duration-300">
              <div className="p-6">
                <h3 className="text-xl font-semibold mb-3 text-onGlass">Data Integration</h3>
                <p className="text-onGlass-secondary mb-4">Connect with Affinity, LinkedIn, and other data sources</p>
                <Button variant="primary" onClick={() => window.location.href = '/knowledge-graph'}>
                  Connect
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Metrics Section */}
      <section className="px-6 pb-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12 text-onGlass">Platform Metrics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricTile
              title="Knowledge Graph Nodes"
              value="2,500+"
              subtitle="Companies & Contacts"
            />
            <MetricTile
              title="AI Insights Generated"
              value="1,200+"
              subtitle="This month"
            />
            <MetricTile
              title="Search Accuracy"
              value="94%"
              subtitle="Vector + Text similarity"
            />
            <MetricTile
              title="Extension Installs"
              value="500+"
              subtitle="Active users"
            />
          </div>
        </div>
      </section>

      {/* Search Section */}
      <section className="px-6 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="glass-panel text-center">
            <h2 className="text-3xl font-bold mb-6 text-onGlass">Find What You Need</h2>
            <p className="text-onGlass-secondary mb-8 text-lg">
              Search across companies, contacts, and AI-generated insights
            </p>
            <div className="max-w-2xl mx-auto">
              <SearchInput
                placeholder="Search companies, contacts, insights..."
                className="text-lg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="glass-panel text-center">
            <h2 className="text-3xl font-bold mb-6 text-onGlass">Ready to Get Started?</h2>
            <p className="text-onGlass-secondary mb-8 text-lg">
              Join thousands of professionals using MV Intelligence to make better decisions
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="primary" size="lg">
                Start Free Trial
              </Button>
              <Button variant="secondary" size="lg">
                Schedule Demo
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
