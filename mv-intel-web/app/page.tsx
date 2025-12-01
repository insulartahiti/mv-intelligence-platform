'use client';

import { useState, useEffect } from 'react';
import { makeBrowserClient } from '@/lib/supabaseClient';
import KnowledgeGraphPageContent from '@/app/components/KnowledgeGraphPageContent';
import LoginView from '@/app/components/auth/LoginView';

// Supabase client
const supabase = makeBrowserClient();

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [userFullName, setUserFullName] = useState<string | null>(null);
  const [userEntity, setUserEntity] = useState<any>(null);

  useEffect(() => {
    // 1. Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) handleUserSetup(session.user);
      else setLoading(false);
    });

    // 2. Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) handleUserSetup(session.user);
      else setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleUserSetup = async (user: any) => {
      // 1. Extract Name
      let firstName = 'User';
      let fullName = 'User';

      if (user.user_metadata?.full_name) {
          fullName = user.user_metadata.full_name;
          firstName = fullName.split(' ')[0];
      } else if (user.email) {
          // Handle email formatting (e.g., harsh.govil@...)
          const localPart = user.email.split('@')[0];
          // Split by dot or underscore
          const parts = localPart.split(/[._]/);
          
          // Capitalize parts
          const capitalizedParts = parts.map((p: string) => 
              p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
          );

          firstName = capitalizedParts[0];
          fullName = capitalizedParts.join(' ');
      }

      setUserName(firstName);
      setUserFullName(fullName);

      // 2. Find Entity in Graph
      try {
          // Try finding person by name match
          // In future: could also match by email field if populated
          const { data: entity } = await supabase
              .schema('graph')
              .from('entities')
              .select('id, name, type, business_analysis, enrichment_data')
              .eq('type', 'person')
              .ilike('name', fullName)
              .single();
          
          if (entity) {
              console.log('Found user entity:', entity);
              setUserEntity(entity);
          }
      } catch (e) {
          console.error('Error finding user entity:', e);
      }

      setLoading(false);
  };

  const getGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) return 'Good morning';
      if (hour < 18) return 'Good afternoon';
      return 'Good evening';
  };

  if (loading) {
      // Splash screen / Loading state
  return (
        <div className="flex h-screen bg-slate-950 items-center justify-center">
             <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      );
  }

  // ------------------------------------------------------------------
  // AUTHENTICATED STATE
  // ------------------------------------------------------------------
  if (session) {
      return (
        <KnowledgeGraphPageContent 
            greeting={{
                text: getGreeting(),
                name: userName || 'there'
            }} 
            userEntity={userEntity}
        />
      );
  }

  // ------------------------------------------------------------------
  // UNAUTHENTICATED (LOGIN) STATE
  // ------------------------------------------------------------------
  return (
    <div className="flex h-screen bg-slate-950 items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black relative overflow-hidden">
        
        {/* Background Elements */}
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
        
        <div className="w-full max-w-3xl transform -translate-y-12 transition-all duration-700 ease-out animate-fadeIn relative z-10">
            <div className="text-center mb-16">
                <h1 className="text-6xl md:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-6 tracking-tight pb-2">
                    Motive Intelligence
                </h1>
                <p className="text-slate-400 text-xl font-light max-w-xl mx-auto leading-relaxed">
                    The conversational knowledge graph with proprietary insights.
                </p>
            </div>
            
            <LoginView onLoginSuccess={() => {}} />

            <div className="mt-16 text-center">
                 <p className="text-slate-600 text-xs uppercase tracking-[0.2em] font-sans">
                    Restricted Access • Authorized Personnel Only
                 </p>
          </div>
        </div>
    </div>
  );
}
