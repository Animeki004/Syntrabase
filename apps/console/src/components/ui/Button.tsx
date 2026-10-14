'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'danger';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'secondary',
      size = 'md',
      loading = false,
      disabled = false,
      icon,
      iconPosition = 'left',
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => {
    const baseClass = 'btn';
    const variantClass = variant === 'destructive' || variant === 'danger' ? 'btn-danger' : `btn-${variant}`;
    const sizeClass = `btn-${size}`;

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={`${baseClass} ${variantClass} ${sizeClass} ${className}`}
        {...props}
      >
        {loading && <Loader2 size={14} className="animate-spin" />}
        {!loading && icon && iconPosition === 'left' && <span className="btn-icon">{icon}</span>}
        {children && <span>{children}</span>}
        {!loading && icon && iconPosition === 'right' && <span className="btn-icon">{icon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
