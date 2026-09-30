import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        /** Verde: o produto esta saudavel. */
        success:
          'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
        /** Ambar: margem apertada, merece atencao. */
        warning:
          'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * <span>, nao <div>: um selo vive dentro de uma linha de texto, muitas vezes
 * num <p>, e um <div> dentro de <p> e HTML invalido — o browser parte o
 * paragrafo e o React refaz a pagina toda ao hidratar.
 */
function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

function Separator({ className }: { className?: string }) {
  return <div className={cn('h-px w-full shrink-0 bg-border', className)} />;
}

/** Caixa de aviso usada pelo motor de precificacao. */
function Alert({
  tone = 'warning',
  children,
  className,
}: {
  tone?: 'warning' | 'destructive' | 'info';
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    warning:
      'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
    destructive:
      'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200',
    info: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200',
  };
  return (
    <div className={cn('rounded-md border px-3 py-2 text-sm', tones[tone], className)}>
      {children}
    </div>
  );
}

export { Badge, badgeVariants, Separator, Alert };
