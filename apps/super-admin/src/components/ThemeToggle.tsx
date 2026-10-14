'use client';

import React from 'react';
import { useTheme } from './ThemeContext';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-toggle-btn ${className}`}
      title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      aria-label="Toggle visual theme"
    >
      {resolvedTheme === 'dark' ? (
        <Sun size={16} className="text-muted hover:text-primary transition-colors" />
      ) : (
        <Moon size={16} className="text-muted hover:text-primary transition-colors" />
      )}
    </button>
  );
}
