'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Network, 
  Brain, 
  ShieldCheck, 
  Search, 
  Database, 
  X, 
  ArrowRight 
} from 'lucide-react';

const FEATURES = [
  {
    icon: Network,
    title: 'Conversational Knowledge Graph',
    description: 'Aggregates data from Affinity (CRM), external sources, and interaction logs into a unified graph database, enabling natural language queries.'
  },
  {
    icon: Search,
    title: 'Hybrid Search Architecture',
    description: 'Combines Vector Search (semantic similarity) with Graph Traversal (network connections) and Taxonomy Classification for precise retrieval.'
  },
  {
    icon: Brain,
    title: 'AI-Powered Enrichment',
    description: 'Uses GPT-5.1 for reasoning and Perplexity for real-time web enrichment, automatically updating entity metadata and summarizing interactions.'
  },
  {
    icon: ShieldCheck,
    title: 'Legal & Financial Intelligence',
    description: 'Specialized pipelines for ingesting financial reports (PDF/Excel) and analyzing legal documents (SPAs, Term Sheets) with pixel-level audit trails.'
  }
];

export default function IntroOverlay() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if we've shown this before
    const hasSeenIntro = localStorage.getItem('mv_arch_intro_seen');
    if (!hasSeenIntro) {
      setIsVisible(true);
    }
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    localStorage.setItem('mv_arch_intro_seen', 'true');
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden relative"
          >
            {/* Background Gradients */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3 pointer-events-none" />

            {/* Close Button */}
            <button 
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-full transition-colors z-10"
            >
              <X size={20} />
            </button>

            <div className="p-8 md:p-12">
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 mb-6 shadow-lg shadow-blue-900/20">
                  <Database size={32} className="text-white" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                  Motive Intelligence Platform
                </h2>
                <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
                  A unified system for relationship intelligence, portfolio management, and automated deal analysis.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                {FEATURES.map((feature, idx) => (
                  <div key={idx} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 hover:bg-slate-800/60 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-700 shrink-0 text-blue-400">
                        <feature.icon size={24} />
                      </div>
                      <div>
                        <h3 className="text-white font-semibold text-base mb-1.5">{feature.title}</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-center">
                <button
                  onClick={handleClose}
                  className="group flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-blue-900/30 hover:shadow-blue-900/50"
                >
                  Explore Architecture
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

