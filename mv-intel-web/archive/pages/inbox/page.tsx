'use client';
import UnifiedInbox from '../components/UnifiedInbox';

export default function InboxPage() {
  return (
    <div className="min-h-screen app-backdrop">
      <div className="max-w-7xl mx-auto p-6">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-onGlass mb-2">Unified Inbox</h1>
          <p className="text-xl text-onGlass-secondary">
            Portfolio email processing and intelligence extraction
          </p>
        </header>

        <UnifiedInbox />
      </div>
    </div>
  );
}