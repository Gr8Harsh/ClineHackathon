import * as React from 'react';
import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils.ts';

export const Dialog = Primitive.Root;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export function DialogContent({ children, className, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal>
    <Primitive.Overlay className="preview-dialog-overlay fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm" />
    <Primitive.Content className={cn('preview-dialog fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-3xl border border-slate-200 bg-white p-7 shadow-xl', className)} {...props}>
      {children}
      <Primitive.Close className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-full border-0 bg-transparent text-slate-500 hover:bg-slate-100" aria-label="Close dialog"><X size={18} /></Primitive.Close>
    </Primitive.Content>
  </Primitive.Portal>;
}