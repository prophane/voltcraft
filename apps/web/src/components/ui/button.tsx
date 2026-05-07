import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', loading, disabled, children, ...props }, ref) => {
    const variantClass = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      ghost: 'btn-ghost',
      danger: 'btn bg-error-bg text-error border border-error/30 hover:bg-error/20',
    }[variant]

    const sizeClass = {
      sm: 'h-7 px-3 text-xs',
      md: 'h-9 px-4 text-sm',
      lg: 'h-11 px-6 text-base',
    }[size]

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(variantClass, sizeClass, className)}
        {...props}
      >
        {loading && <Loader2 size={14} className="animate-spin flex-shrink-0" />}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'
