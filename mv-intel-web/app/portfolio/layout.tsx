'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, FileText, Scale, TrendingUp, Home } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  description?: string;
}

const navItems: NavItem[] = [
  {
    label: 'Overview',
    href: '/portfolio',
    icon: <Home size={18} />,
    description: 'Portfolio dashboard'
  },
  {
    label: 'Financials',
    href: '/portfolio/financials',
    icon: <TrendingUp size={18} />,
    description: 'Financial data ingestion'
  },
  {
    label: 'Legal',
    href: '/portfolio/legal',
    icon: <Scale size={18} />,
    description: 'Legal document analysis'
  }
];

export default function PortfolioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link 
                href="/" 
                className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
              >
                <Briefcase size={24} className="text-emerald-400" />
                <span className="text-lg font-semibold text-white">Portfolio</span>
              </Link>
              
              {/* Navigation */}
              <nav className="hidden md:flex items-center gap-1 ml-8">
                {navItems.map((item) => {
                  const isActive = pathname === item.href || 
                    (item.href !== '/portfolio' && pathname.startsWith(item.href));
                  
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`
                        flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                        ${isActive 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                        }
                      `}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
            
            {/* Back to main app */}
            <Link 
              href="/knowledge-graph"
              className="text-sm text-white/50 hover:text-white transition-colors"
            >
              ← Back to Knowledge Graph
            </Link>
          </div>
        </div>
      </header>
      
      {/* Mobile Navigation */}
      <nav className="md:hidden border-b border-white/10 bg-black/10 px-4 py-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/portfolio' && pathname.startsWith(item.href));
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all
                  ${isActive 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'text-white/60 hover:text-white'
                  }
                `}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      
      {/* Main Content */}
      <main>
        {children}
      </main>
    </div>
  );
}


