import { lazy } from 'react';

// Lazy-load the entire presentations feature
export const PresentationsPage = lazy(() => import('./PresentationsPage'));
export const PresentationViewer = lazy(() => import('./PresentationViewer'));
export const EmbedPage = lazy(() => import('./EmbedPage'));
