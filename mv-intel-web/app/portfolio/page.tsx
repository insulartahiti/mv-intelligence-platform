'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Scale, 
  TrendingUp, 
  FileText, 
  Upload, 
  ArrowRight,
  Building2,
  PieChart,
  Shield
} from 'lucide-react';

interface FeatureCard {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  status: 'active' | 'coming_soon';
  stats?: { label: string; value: string }[];
}

const features: FeatureCard[] = [
  {
    title: 'Financial Analysis',
    description: 'Ingest and analyze portfolio company financials. Extract KPIs, track performance, and generate insights from board decks and financial reports.',
    icon: <TrendingUp size={32} />,
    href: '/portfolio/financials',
    status: 'active',
    stats: [
      { label: 'Supported formats', value: 'PDF, Excel' },
      { label: 'Metrics tracked', value: '50+' }
    ]
  },
  {
    title: 'Legal Document Analysis',
    description: 'Analyze term sheets, SPAs, SHAs, SAFEs, and other investor documentation. Extract key terms, identify risks, and compare against market standards.',
    icon: <Scale size={32} />,
    href: '/portfolio/legal',
    status: 'active',
    stats: [
      { label: 'Document types', value: '7+' },
      { label: 'Jurisdictions', value: 'US, UK, EU' }
    ]
  }
];

export default function PortfolioPage() {
  return (
    <div className="min-h-[calc(100vh-80px)] p-8">
      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm mb-6">
            <Building2 size={16} />
            Portfolio Intelligence
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Portfolio Management Tools
          </h1>
          <p className="text-lg text-white/60 max-w-2xl mx-auto">
            Comprehensive analysis tools for portfolio company financials and legal documentation. 
            Extract insights, track performance, and manage risk.
          </p>
        </div>
        
        {/* Feature Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {features.map((feature) => (
            <Link
              key={feature.href}
              href={feature.href}
              className="group relative bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8 hover:border-emerald-500/30 hover:bg-white/[0.07] transition-all duration-300"
            >
              {/* Status Badge */}
              {feature.status === 'coming_soon' && (
                <div className="absolute top-4 right-4 px-2 py-1 bg-amber-500/20 border border-amber-500/30 rounded text-xs text-amber-400">
                  Coming Soon
                </div>
              )}
              
              {/* Icon */}
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400 mb-6 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              
              {/* Content */}
              <h2 className="text-2xl font-semibold text-white mb-3 flex items-center gap-2">
                {feature.title}
                <ArrowRight size={20} className="text-white/40 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
              </h2>
              <p className="text-white/60 mb-6 leading-relaxed">
                {feature.description}
              </p>
              
              {/* Stats */}
              {feature.stats && (
                <div className="flex gap-6 pt-4 border-t border-white/10">
                  {feature.stats.map((stat) => (
                    <div key={stat.label}>
                      <div className="text-lg font-semibold text-emerald-400">{stat.value}</div>
                      <div className="text-xs text-white/40">{stat.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
        
        {/* Quick Actions */}
        <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-2xl border border-emerald-500/20 p-8">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Upload size={20} className="text-emerald-400" />
            Quick Actions
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            <Link
              href="/portfolio/financials"
              className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-lg border border-white/10 hover:border-emerald-500/30 transition-colors"
            >
              <FileText size={18} className="text-emerald-400" />
              <div>
                <div className="text-white font-medium text-sm">Upload Financials</div>
                <div className="text-white/50 text-xs">Board deck, investor report</div>
              </div>
            </Link>
            <Link
              href="/portfolio/legal"
              className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-lg border border-white/10 hover:border-emerald-500/30 transition-colors"
            >
              <Scale size={18} className="text-emerald-400" />
              <div>
                <div className="text-white font-medium text-sm">Analyze Term Sheet</div>
                <div className="text-white/50 text-xs">Extract key terms</div>
              </div>
            </Link>
            <Link
              href="/portfolio/legal?type=safe"
              className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-lg border border-white/10 hover:border-emerald-500/30 transition-colors"
            >
              <Shield size={18} className="text-emerald-400" />
              <div>
                <div className="text-white font-medium text-sm">Review SAFE/CLA</div>
                <div className="text-white/50 text-xs">Convertible instrument analysis</div>
              </div>
            </Link>
          </div>
        </div>
        
        {/* Info Footer */}
        <div className="mt-8 text-center text-white/40 text-sm">
          <p>All analysis is for informational purposes and is not legal or financial advice.</p>
          <p>Material matters should be reviewed by external counsel and advisors.</p>
        </div>
      </div>
    </div>
  );
}


