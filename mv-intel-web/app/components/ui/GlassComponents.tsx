import React from 'react';
import { 
  Home, Search, BarChart3, Users, Calendar, FileText, 
  Settings, Bell, Plus, ArrowRight, TrendingUp, Target,
  Zap, Shield, Globe, Briefcase, Building2, UserCheck,
  Mail, Phone, MapPin, Clock, Star, Award, CheckCircle,
  AlertCircle, XCircle, Info, HelpCircle, ChevronDown,
  ChevronRight, ChevronLeft, ChevronUp, Filter, SortAsc,
  SortDesc, Download, Upload, Share2, Copy, Edit, Trash,
  Eye, EyeOff, Lock, Unlock, RefreshCw, RotateCcw, Menu,
  ClipboardList, MessageCircle
} from 'lucide-react';

// Panel component with MV Glass design system (dark theme as default)
export type PanelProps = React.HTMLAttributes<HTMLDivElement> & { 
  inset?: boolean;
  variant?: 'default' | 'light';
}

export function Panel({ 
  className = "", 
  inset = false, 
  variant = 'default',
  ...props 
}: PanelProps) {
  // Default is now dark glass, 'light' variant uses the lighter glass
  const baseClasses = variant === 'light' ? 'glass' : 'mv-glass';
  
  return (
    <div className={`${baseClasses} relative ${className}`} {...props}>
      {inset && (
        <div 
          className="pointer-events-none absolute inset-0 rounded-md glass-inset"
        />
      )}
    </div>
  );
}

// Toolbar component with MV Glass design system
export function Toolbar({ 
  left, 
  center, 
  right 
}: {
  left?: React.ReactNode; 
  center?: React.ReactNode; 
  right?: React.ReactNode;
}) {
  return (
    <div className="glass-nav">
      <div className="nav-container">
        <div className="nav-content">
          {left && <div className="flex-shrink-0">{left}</div>}
          {center && <div className="flex-1 flex justify-center">{center}</div>}
          {right && <div className="flex-shrink-0">{right}</div>}
        </div>
      </div>
    </div>
  );
}

// Button component with MV Glass design system
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ 
  variant = 'primary', 
  size = 'md',
  className = "", 
  children,
  ...props 
}: ButtonProps) {
  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };

  const variantClasses = {
    primary: 'glass-button primary',
    secondary: 'glass-button secondary',
    neutral: 'glass-button'
  };

  return (
    <button 
      className={`${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// Card component with MV Glass design system
export function Card({ 
  children, 
  className = "",
  ...props 
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`glass-card ${className}`} {...props}>
      {children}
    </div>
  );
}

// Input component with MV Glass design system
export function Input({
  label,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-white/80">
          {label}
        </label>
      )}
      <input
        className={`glass-input w-full px-4 py-3 rounded-lg ${className}`}
        {...props}
      />
    </div>
  );
}

// Search Input component with MV Glass design system
export function SearchInput({ 
  placeholder = "Search...",
  className = "",
  ...props 
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      className={`glass-input w-full px-4 py-3 rounded-lg ${className}`}
      {...props}
    />
  );
}

// Metric Tile component with MV Glass design system
export function MetricTile({ 
  title, 
  value, 
  subtitle,
  className = "",
  ...props 
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`glass-card text-center ${className}`} {...props}>
      <h3 className="text-lg font-medium text-onGlass-secondary mb-2">{title}</h3>
      <div className="text-3xl font-bold text-onGlass mb-1">{value}</div>
      {subtitle && (
        <p className="text-sm text-onGlass-muted">{subtitle}</p>
      )}
    </div>
  );
}

// Status badge component
export function StatusBadge({ 
  status, 
  children 
}: {
  status: 'success' | 'warning' | 'error' | 'info';
  children: React.ReactNode;
}) {
  const statusColors = {
    success: 'bg-green-500/20 text-green-400 border-green-500/30',
    warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  }
  
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${statusColors[status]}`}>
      {children}
    </span>
  )
}
// Professional icon components
export const Icons = {
  Home,
  Portfolio: BarChart3,
  Deals: Briefcase,
  Actions: ClipboardList,
  Network: Globe,
  WeekAhead: Calendar,
  SlideExtractor: FileText,
  Search,
  Settings,
  Plus,
  Download,
  Eye,
  Contact: MessageCircle,
  TrendingUp,
  Users,
  Company: Building2,
  Target,
  Zap,
  ArrowRight
}

// App Shell components for native app features
export function useKeyboardShortcuts() {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Add keyboard shortcuts here
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'k':
            event.preventDefault();
            // Open search
            break;
          case 'n':
            event.preventDefault();
            // New item
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}

export function useTouchGestures() {
  React.useEffect(() => {
    // Add touch gesture support here
    // This could include swipe navigation, pinch to zoom, etc.
  }, []);
}

