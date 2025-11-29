'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Action {
  id: string;
  title: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'PARKED';
  related_company?: { id: string; name: string };
  related_contact?: { id: string; name: string };
  source?: string;
  due_at?: string;
  created_at: string;
  created_by?: { full_name: string };
}

const statusConfig = {
  OPEN: { label: 'Open', color: 'bg-intent-warning text-black', icon: '📋' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-blue-600 text-white', icon: '🔄' },
  DONE: { label: 'Done', color: 'bg-intent-positive text-white', icon: '✅' },
  PARKED: { label: 'Parked', color: 'bg-text-muted text-text-primary', icon: '⏸️' },
};

export default function ActionsBoard() {
  const [orgId, setOrgId] = useState('REPLACE_WITH_ORG_UUID');
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [filters, setFilters] = useState({
    company: '',
    status: '',
    assignee: '',
    dueDate: '',
  });

  async function loadActions() {
    setLoading(true);
    try {
      const r = await fetch(`/api/actions?orgId=${orgId}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Load failed');
      setActions(j.actions || []);
    } catch (e: any) {
      setMsg(e.message);
    }
    setLoading(false);
  }

  async function updateActionStatus(actionId: string, newStatus: Action['status']) {
    try {
      const r = await fetch(`/api/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!r.ok) throw new Error('Update failed');
      await loadActions(); // Refresh the list
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  async function createAction() {
    const title = prompt('Action title:');
    if (!title) return;
    
    try {
      const r = await fetch('/api/actions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, title }),
      });
      if (!r.ok) throw new Error('Create failed');
      await loadActions();
      setMsg('Action created');
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  useEffect(() => {
    if (orgId) loadActions();
  }, [orgId]);

  // Filter actions based on current filters
  const filteredActions = actions.filter(action => {
    if (filters.company && action.related_company?.name.toLowerCase().includes(filters.company.toLowerCase())) return false;
    if (filters.status && action.status !== filters.status) return false;
    if (filters.assignee && action.created_by?.full_name.toLowerCase().includes(filters.assignee.toLowerCase())) return false;
    if (filters.dueDate && action.due_at && new Date(action.due_at) < new Date(filters.dueDate)) return false;
    return true;
  });

  // Group actions by status
  const actionsByStatus = Object.keys(statusConfig).reduce((acc, status) => {
    acc[status] = filteredActions.filter(action => action.status === status);
    return acc;
  }, {} as Record<string, Action[]>);

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-6">
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Actions Board</h1>
          <p className="text-text-secondary">Track and manage tasks, follow-ups, and action items across your portfolio.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2">
            <input
              className="input w-48"
              placeholder="Filter by company..."
              value={filters.company}
              onChange={(e) => setFilters(prev => ({ ...prev, company: e.target.value }))}
            />
            <select
              className="input w-32"
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            >
              <option value="">All Status</option>
              {Object.entries(statusConfig).map(([status, config]) => (
                <option key={status} value={status}>{config.label}</option>
              ))}
            </select>
          </div>
          
          <div className="flex gap-2">
            <input
              className="input w-48"
              placeholder="Org ID"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            />
            <button className="btn" onClick={loadActions} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button className="btn-secondary" onClick={createAction}>
              + New Action
            </button>
          </div>
        </div>
      </header>

      {msg && (
        <div className="bg-surface border border-border rounded-card p-3 text-text-primary">
          {msg}
        </div>
      )}

      {/* Kanban Board */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {Object.entries(statusConfig).map(([status, config]) => (
          <div key={status} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className={`text-sm font-medium px-2 py-1 rounded-full ${config.color}`}>
                <span className="mr-1">{config.icon}</span>
                {config.label}
              </h3>
              <span className="text-text-secondary text-sm bg-surface px-2 py-1 rounded-full">
                {actionsByStatus[status]?.length || 0}
              </span>
            </div>
            
            <div className="space-y-3 min-h-[400px]">
              {actionsByStatus[status]?.map((action) => (
                <div key={action.id} className="card cursor-pointer hover:shadow-lg transition-shadow duration-fast">
                  <div className="space-y-2">
                    <h4 className="font-medium text-text-primary line-clamp-2">{action.title}</h4>
                    
                    {action.related_company && (
                      <div className="text-sm text-text-secondary">
                        <span className="mr-1">🏢</span>
                        <Link 
                          href={`/portfolio/${action.related_company.id}`}
                          className="hover:text-text-primary transition-colors duration-fast"
                        >
                          {action.related_company.name}
                        </Link>
                      </div>
                    )}
                    
                    {action.due_at && (
                      <div className="text-sm text-text-secondary">
                        <span className="mr-1">📅</span>
                        Due: {new Date(action.due_at).toLocaleDateString()}
                      </div>
                    )}
                    
                    {action.source && (
                      <div className="text-xs text-text-muted bg-surface px-2 py-1 rounded">
                        Source: {action.source}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between pt-2">
                      <div className="text-xs text-text-muted">
                        {action.created_by?.full_name || 'Unassigned'}
                      </div>
                      
                      <div className="flex gap-1">
                        {status !== 'DONE' && (
                          <button
                            onClick={() => updateActionStatus(action.id, 'DONE')}
                            className="text-xs bg-intent-positive text-white px-2 py-1 rounded hover:bg-green-600 transition-colors duration-fast"
                          >
                            Complete
                          </button>
                        )}
                        
                        {status === 'OPEN' && (
                          <button
                            onClick={() => updateActionStatus(action.id, 'IN_PROGRESS')}
                            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition-colors duration-fast"
                          >
                            Start
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {(!actionsByStatus[status] || actionsByStatus[status].length === 0) && (
                <div className="card border-dashed border-border text-text-muted text-center py-8">
                  <div className="text-2xl mb-2">📝</div>
                  <div className="text-sm">No {config.label.toLowerCase()} actions</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile view - List format */}
      <div className="lg:hidden space-y-4">
        <h3 className="text-lg font-medium text-text-primary">All Actions</h3>
        {filteredActions.map((action) => (
          <div key={action.id} className="card">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-1 rounded-full text-xs ${statusConfig[action.status].color}`}>
                    {statusConfig[action.status].icon} {statusConfig[action.status].label}
                  </span>
                </div>
                <h4 className="font-medium text-text-primary mb-2">{action.title}</h4>
                
                {action.related_company && (
                  <div className="text-sm text-text-secondary mb-1">
                    <span className="mr-1">🏢</span>
                    <Link 
                      href={`/portfolio/${action.related_company.id}`}
                      className="hover:text-text-primary transition-colors duration-fast"
                    >
                      {action.related_company.name}
                    </Link>
                  </div>
                )}
                
                {action.due_at && (
                  <div className="text-sm text-text-secondary mb-2">
                    <span className="mr-1">📅</span>
                    Due: {new Date(action.due_at).toLocaleDateString()}
                  </div>
                )}
              </div>
              
              <div className="flex flex-col gap-2 ml-4">
                {status !== 'DONE' && (
                  <button
                    onClick={() => updateActionStatus(action.id, 'DONE')}
                    className="text-xs bg-intent-positive text-white px-3 py-1 rounded hover:bg-green-600 transition-colors duration-fast"
                  >
                    Complete
                  </button>
                )}
                
                {status === 'OPEN' && (
                  <button
                    onClick={() => updateActionStatus(action.id, 'IN_PROGRESS')}
                    className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors duration-fast"
                  >
                    Start
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
