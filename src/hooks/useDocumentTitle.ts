import { useEffect, useRef } from 'react';
import {
  getStandardDocumentTitle,
  setDocumentTitle,
  applyBrowserFavicon,
  type StandardTitleOptions,
} from '../utils/documentTitle.ts';

/**
 * Reusable hook to dynamically synchronize document/browser title for pages,
 * routes, and modals with automatic cleanup on unmount.
 *
 * @param titleOrOptions A static title string, a title getter function, or StandardTitleOptions object
 * @param deps Dependency array to trigger title recalculation
 */
export function useDocumentTitle(
  titleOrOptions: string | StandardTitleOptions | (() => string),
  deps: any[] = []
): void {
  const previousTitleRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (previousTitleRef.current === null) {
      previousTitleRef.current = document.title;
    }

    let nextTitle = '';
    if (typeof titleOrOptions === 'string') {
      nextTitle = titleOrOptions;
    } else if (typeof titleOrOptions === 'function') {
      nextTitle = titleOrOptions();
    } else if (titleOrOptions && typeof titleOrOptions === 'object') {
      nextTitle = getStandardDocumentTitle(titleOrOptions);
    }

    if (nextTitle) {
      setDocumentTitle(nextTitle);
    }
    applyBrowserFavicon();

    return () => {
      // Revert to previous title if unmounting and previous title exists
      if (previousTitleRef.current && typeof document !== 'undefined') {
        document.title = previousTitleRef.current;
        applyBrowserFavicon();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
