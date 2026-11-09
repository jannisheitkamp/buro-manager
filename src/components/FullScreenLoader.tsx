import { Spinner } from './ui';

export const FullScreenLoader = ({ label }: { label?: string }) => (
  <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-900" role="status" aria-live="polite">
    <img src="/favicon.svg" alt="" className="h-10 w-10" />
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <Spinner className="h-4 w-4" />
      {label || 'Büro Manager wird geladen'}
    </div>
  </div>
);
