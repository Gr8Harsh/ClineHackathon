import * as React from 'react';
import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils.ts';

export const Dialog = Primitive.Root;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export function DialogContent({ children, className, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  const restoreFocus = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => { restoreFocus.current = document.activeElement as HTMLElement; }, []);
  return <Primitive.Portal>
    <Primitive.Overlay className="preview-dialog-overlay" />
    <Primitive.Content className={cn('preview-dialog', className)} onOpenAutoFocus={() => { restoreFocus.current = document.activeElement as HTMLElement; }} onCloseAutoFocus={event => { event.preventDefault(); restoreFocus.current?.focus(); }} {...props}>
      {children}
      <Primitive.Close className="dialog-close" aria-label="Close dialog"><X size={20} /></Primitive.Close>
    </Primitive.Content>
  </Primitive.Portal>;
}