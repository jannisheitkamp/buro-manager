import { ReactNode } from 'react';

// Dezentes Einblenden beim Seitenwechsel (per CSS, respektiert "weniger Bewegung")
export const PageTransition = ({ children }: { children: ReactNode }) => <div className="w-full animate-fade-in">{children}</div>;
