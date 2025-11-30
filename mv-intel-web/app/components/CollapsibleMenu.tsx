'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, Network, Chrome, Activity, Database } from 'lucide-react';
import { usePathname } from 'next/navigation';

export default function CollapsibleMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="fixed top-4 left-4 z-50 flex flex-col items-start font-sans">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-full text-slate-200 hover:text-white hover:bg-slate-800 transition-all shadow-lg focus:outline-none ring-offset-2 focus:ring-2 ring-blue-500/50"
        aria-label="Toggle Menu"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <div
        className={`mt-3 bg-slate-900/90 backdrop-blur-xl border border-slate-700 rounded-xl shadow-2xl overflow-hidden min-w-[200px] transition-all duration-300 origin-top-left ${
          isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-4 pointer-events-none'
        }`}
      >
        <nav className="flex flex-col p-2 space-y-1">
          <MenuItem href="/" icon={<Network size={18} />} label="Knowledge Graph" active={pathname === '/'} />
          <MenuItem href="/taxonomy" icon={<Database size={18} />} label="Taxonomy View" active={pathname === '/taxonomy'} />
          <MenuItem href="/chrome-extension" icon={<Chrome size={18} />} label="Chrome Extension" active={pathname === '/chrome-extension'} />
          <MenuItem href="/status" icon={<Activity size={18} />} label="Status Dashboard" active={pathname === '/status'} />
        </nav>
      </div>
    </div>
  );
}

function MenuItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 py-3 text-sm rounded-lg transition-colors duration-200 ${
        active 
          ? 'bg-blue-600/20 text-blue-400 font-medium' 
          : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

