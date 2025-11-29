'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav className="glass-nav">
      <div className="nav-container">
        <div className="nav-content">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/" className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">MV</span>
              </div>
              <span className="text-xl font-bold text-white">MV Intelligence</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:block">
            <div className="nav-links">
              <Link 
                href="/knowledge-graph" 
                className="text-white/80 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-white/10"
              >
                Knowledge Graph
              </Link>
            </div>
          </div>

          {/* Right side actions */}
          <div className="hidden md:block">
            <div className="nav-actions">
              <button className="glass-button px-4 py-2">
                Sign In
              </button>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="glass-button p-2 rounded-lg"
            >
              Menu
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden glass-panel mx-4 mb-4">
          <div className="px-2 pt-2 pb-3 space-y-1">
            <Link 
              href="/knowledge-graph" 
              className="text-white/80 hover:text-white block px-3 py-2 rounded-md text-base font-medium transition-colors duration-200"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Knowledge Graph
            </Link>
            <div className="pt-4 border-t border-white/10">
              <button className="glass-button w-full text-left px-3 py-2">
                Sign In
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
