import React from 'react'
import { cn } from '../../lib/utils'
import { useFocusVisible } from '../../hooks/use-focus-visible'
import { FocusRing } from './focus-ring'
import { cva } from 'class-variance-authority'

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "underline-offset-4 hover:underline text-primary",
      },
      size: {
        default: "h-10 py-2 px-4",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const focusProps = useFocusVisible()
    
    return (
      <FocusRing
        variant={variant === "ghost" ? "subtle" : "default"}
        color="primary" 
        animate
      >
        <button
          className={cn(
            buttonVariants({ 
              variant: variant as ButtonProps["variant"],
              size: size as ButtonProps["size"]
            }),
            className
          )}
          ref={ref}
          {...props}
          {...focusProps}
        />
      </FocusRing>
    )
  }
)

Button.displayName = "Button"