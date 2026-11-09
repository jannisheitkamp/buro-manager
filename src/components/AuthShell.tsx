import { ReactNode } from 'react';

/** Ruhiger Rahmen für Anmelde-, 2FA- und Einrichtungsseiten */
export const AuthShell = ({ title, description, children, footer, wide }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) => (
  <div className="flex min-h-dvh flex-col items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-900">
    <div className={wide ? 'w-full max-w-2xl' : 'w-full max-w-md'}>
      <div className="mb-8 flex items-center gap-3">
        <img src="/favicon.svg" alt="" className="h-9 w-9" />
        <span className="font-display text-lg font-semibold text-gray-900 dark:text-white">Büro Manager</span>
      </div>
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h1>
        {description && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-4 text-center">{footer}</div>}
    </div>
  </div>
);
