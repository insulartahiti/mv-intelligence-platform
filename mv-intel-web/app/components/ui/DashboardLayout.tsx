import React from 'react';
import { Card, Panel, Button, SearchInput } from './GlassComponents';

interface DashboardLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  sidebar?: React.ReactNode;
  metrics?: Array<{
    label: string;
    value: string | number;
    delta?: string;
    trend?: 'up' | 'down' | 'neutral';
  }>;
}

export function DashboardLayout({ 
  title, 
  subtitle, 
  children, 
  actions, 
  sidebar, 
  metrics 
}: DashboardLayoutProps) {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-semibold text-onGlassDark">{title}</h1>
          {subtitle && (
            <p className="text-onGlassDarkMuted mt-2">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center space-x-3">
            {actions}
          </div>
        )}
      </header>

      {/* Metrics Row */}
      {metrics && metrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric, index) => (
            <Card key={index} className="text-center">
              <div className="text-sm text-onGlassDarkMuted mb-1">{metric.label}</div>
              <div className="text-2xl font-semibold text-onGlassDark">{metric.value}</div>
              {metric.delta && (
                <div className={`text-sm font-mono mt-1 ${
                  metric.trend === 'up' ? 'text-green-400' : 
                  metric.trend === 'down' ? 'text-red-400' : 
                  'text-onGlassDarkMuted'
                }`}>
                  {metric.delta}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-6">
        {/* Sidebar */}
        {sidebar && (
          <aside className="col-span-12 lg:col-span-3 space-y-4">
            {sidebar}
          </aside>
        )}
        
        {/* Main Content Area */}
        <main className={`space-y-6 ${sidebar ? 'col-span-12 lg:col-span-9' : 'col-span-12'}`}>
          {children}
        </main>
      </div>
    </div>
  );
}

// Data Table Component
interface DataTableProps<T> {
  data: T[];
  columns: Array<{
    key: keyof T;
    label: string;
    render?: (value: any, row: T) => React.ReactNode;
  }>;
  onRowClick?: (row: T) => void;
  className?: string;
}

export function DataTable<T>({ 
  data, 
  columns, 
  onRowClick, 
  className = "" 
}: DataTableProps<T>) {
  return (
    <Panel className={`overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              {columns.map((column) => (
                <th 
                  key={String(column.key)}
                  className="px-4 py-3 text-left text-sm font-medium text-onGlassDarkMuted"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr 
                key={rowIndex}
                className={`border-b border-white/5 hover:bg-white/5 transition-colors duration-sm ${
                  onRowClick ? 'cursor-pointer' : ''
                }`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((column) => (
                  <td key={String(column.key)} className="px-4 py-3 text-sm text-onGlassDark">
                    {column.render 
                      ? column.render(row[column.key], row)
                      : String(row[column.key] || '')
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// Filter Bar Component
interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

export function FilterBar({ children, className = "" }: FilterBarProps) {
  return (
    <Panel className={`p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {children}
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="secondary" size="sm">Clear</Button>
          <Button variant="primary" size="sm">Apply</Button>
        </div>
      </div>
    </Panel>
  );
}

// Empty State Component
interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="text-center py-12">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-onGlassDark mb-2">{title}</h3>
      <p className="text-onGlassDarkMuted mb-6 max-w-md mx-auto">{description}</p>
      {action && action}
    </Card>
  );
}
