'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Redirect to the existing /import page for financial data ingestion.
 * This is a temporary redirect until the financials module is moved under /portfolio.
 */
export default function FinancialsRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/import');
  }, [router]);
  
  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center">
      <div className="text-white/60 flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
        Redirecting to Financial Ingestion...
      </div>
    </div>
  );
}


