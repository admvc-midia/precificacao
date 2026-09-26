/**
 * Label e Select.
 *
 * O Select e um `<select>` nativo com o visual do shadcn/ui, e nao o
 * componente Radix. A razao e funcional: quase todos os formularios desta
 * aplicacao sao `<form action={serverAction}>` sem JavaScript de cliente, e
 * o `<select>` nativo submete o seu valor sozinho. O Radix Select obrigaria
 * a transformar cada formulario num componente de cliente com estado e input
 * escondido — mais codigo para o mesmo resultado, e pior no telemovel.
 */

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className,
    )}
    {...props}
  />
));
Label.displayName = 'Label';

const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
    </div>
  ),
);
Select.displayName = 'Select';

/**
 * Campo de formulario: label, controlo e uma linha de ajuda opcional.
 * Existe para que as paginas nao repitam a mesma dupla div/label 40 vezes.
 */
export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export { Label, Select };
