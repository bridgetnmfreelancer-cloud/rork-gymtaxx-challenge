import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { gaPageView } from "@/lib/ga";

/**
 * Sends one GA4 page_view per screen, including the first load.
 *
 * Renders nothing. Mounted once inside the router, so every route — public,
 * private and the landing page — is covered without each screen knowing GA4
 * exists. The gtag tag itself has automatic page views disabled, so this is
 * the only thing emitting them.
 */
export function GaPageViewTracker() {
  const location = useLocation();

  useEffect(() => {
    gaPageView(`${location.pathname}${location.search}`, document.title);
  }, [location.pathname, location.search]);

  return null;
}
