'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Keyboard shortcut hook for native app feel
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd/Ctrl + K for search
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        // Focus search input or open search modal
        const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }

      // Escape to close modals/dropdowns
      if (event.key === 'Escape') {
        // Close any open dropdowns or modals
        const dropdowns = document.querySelectorAll('[data-dropdown]');
        dropdowns.forEach(dropdown => {
          if (dropdown.classList.contains('open')) {
            dropdown.classList.remove('open');
          }
        });
      }

      // Tab navigation improvements
      if (event.key === 'Tab') {
        document.body.classList.add('keyboard-navigation');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}

// Focus trap for modals and dropdowns
export function useFocusTrap(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const focusableElements = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const firstFocusableElement = document.querySelector(focusableElements) as HTMLElement;
    const focusableContent = document.querySelectorAll(focusableElements);
    const lastFocusableElement = focusableContent[focusableContent.length - 1] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstFocusableElement) {
            lastFocusableElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastFocusableElement) {
            firstFocusableElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);
    firstFocusableElement?.focus();

    return () => document.removeEventListener('keydown', handleTabKey);
  }, [active]);
}

// Touch gesture hook for mobile
export function useTouchGestures() {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    const isHorizontalSwipe = Math.abs(distanceX) > Math.abs(distanceY);

    if (isHorizontalSwipe) {
      if (Math.abs(distanceX) > minSwipeDistance) {
        if (distanceX > 0) {
          // Swipe left
          console.log('Swipe left');
        } else {
          // Swipe right
          console.log('Swipe right');
        }
      }
    } else {
      if (Math.abs(distanceY) > minSwipeDistance) {
        if (distanceY > 0) {
          // Swipe up
          console.log('Swipe up');
        } else {
          // Swipe down
          console.log('Swipe down');
        }
      }
    }
  };

  return { onTouchStart, onTouchMove, onTouchEnd };
}

// Toast notification system for native app feel
interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const typeStyles = {
    success: 'bg-green-500/20 border-green-500/30 text-green-400',
    error: 'bg-red-500/20 border-red-500/30 text-red-400',
    info: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
    warning: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'
  };

  return (
    <div className={`glass border rounded-xl px-4 py-3 shadow-elev3 ${typeStyles[type]}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium">{message}</span>
        <button
          onClick={onClose}
          className="ml-4 text-onGlassDarkMuted hover:text-onGlassDark transition-colors duration-sm"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// Toast container
export function ToastContainer() {
  const [toasts, setToasts] = useState<Array<{ id: string } & ToastProps>>([]);

  const addToast = (toast: Omit<ToastProps, 'onClose'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast = {
      ...toast,
      id,
      onClose: () => removeToast(id)
    };
    setToasts(prev => [...prev, newToast]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Expose addToast globally for easy access
  useEffect(() => {
    (window as any).showToast = addToast;
    return () => {
      delete (window as any).showToast;
    };
  }, []);

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map(toast => (
        <Toast key={toast.id} {...toast} />
      ))}
    </div>
  );
}

// Loading spinner for native app feel
export function LoadingSpinner({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  };

  return (
    <div className={`animate-spin rounded-full border-2 border-white/20 border-t-accent ${sizeClasses[size]} ${className}`} />
  );
}

// Skeleton loader for content
export function Skeleton({ className = '', lines = 1 }: { className?: string; lines?: number }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-white/10 rounded animate-pulse"
          style={{ width: `${Math.random() * 40 + 60}%` }}
        />
      ))}
    </div>
  );
}

// Context menu component
interface ContextMenuProps {
  x: number;
  y: number;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function ContextMenu({ x, y, isOpen, onClose, children }: ContextMenuProps) {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed z-50"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="glass border border-white/20 rounded-xl shadow-elev3 py-2 min-w-[200px]">
        {children}
      </div>
      <div
        className="fixed inset-0 z-[-1]"
        onClick={onClose}
      />
    </div>,
    document.body
  );
}

// Context menu item
interface ContextMenuItemProps {
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  disabled?: boolean;
}

export function ContextMenuItem({ onClick, icon, children, disabled = false }: ContextMenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center px-4 py-2 text-sm text-onGlassDark hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-sm ${
        disabled ? '' : 'cursor-pointer'
      }`}
    >
      {icon && <span className="mr-3 h-4 w-4">{icon}</span>}
      {children}
    </button>
  );
}
