'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, Network, Chrome, Activity, Database, Home, Shield, LogOut, Layout, Briefcase, Lightbulb } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { makeBrowserClient } from '@/lib/supabaseClient';

export default function CollapsibleMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const supabase = makeBrowserClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const close = () => setIsOpen(false);

  const isAdmin = user?.email === 'harsh.govil@motivepartners.com';

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  // Do not show menu if not logged in (unless we want to show a login button, but page handles that)
  if (!user) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col items-end font-sans">
      <div className="flex items-center bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-full shadow-lg ring-offset-2 focus-within:ring-2 ring-blue-500/50">
        <button
          onClick={() => window.location.href = '/'}
          className="p-3 text-slate-200 hover:text-white hover:bg-slate-800 transition-all rounded-l-full border-r border-slate-700 focus:outline-none"
          aria-label="Go Home"
        >
            <Home size={24} />
        </button>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-3 text-slate-200 hover:text-white hover:bg-slate-800 transition-all rounded-r-full focus:outline-none"
          aria-label="Toggle Menu"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <div
        className={`mt-3 bg-slate-900/90 backdrop-blur-xl border border-slate-700 rounded-xl shadow-2xl overflow-hidden min-w-[200px] transition-all duration-300 origin-top-right ${
          isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-4 pointer-events-none'
        }`}
      >
        <nav className="flex flex-col p-2 space-y-1">
          <MenuItem onClick={close} href="/" icon={<Network size={18} />} label="Knowledge Graph" active={pathname === '/'} />
          <MenuItem onClick={close} href="/portfolio" icon={<Briefcase size={18} />} label="Portfolio" active={pathname?.startsWith('/portfolio') || false} />
          <MenuItem onClick={close} href="/suggestions" icon={<Lightbulb size={18} />} label="Suggestions" active={pathname === '/suggestions'} />
          <MenuItem onClick={close} href="/taxonomy" icon={<Database size={18} />} label="Taxonomy View" active={pathname === '/taxonomy'} />
          <MenuItem onClick={close} href="/architecture" icon={<Layout size={18} />} label="Architecture" active={pathname === '/architecture'} />
          <MenuItem onClick={close} href="/status" icon={<Activity size={18} />} label="Status Dashboard" active={pathname === '/status'} />
          
          {isAdmin && (
             <div className="pt-2 mt-2 border-t border-slate-700/50">
                <MenuItem onClick={close} href="/admin" icon={<Shield size={18} className="text-yellow-400" />} label="Admin Console" active={pathname === '/admin'} />
             </div>
          )}

          <div className="pt-2 mt-2 border-t border-slate-700/50">
             <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm rounded-lg text-red-400 hover:bg-red-900/20 transition-colors"
             >
                <LogOut size={18} />
                <span>Log Out</span>
             </button>
          </div>
        </nav>
      </div>
    </div>
  );
}

function MenuItem({ href, icon, label, active, onClick }: { href: string; icon: React.ReactNode; label: string; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
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
