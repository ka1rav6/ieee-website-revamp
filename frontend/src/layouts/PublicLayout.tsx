/**
 * The frame every public page sits in.
 *
 * Handles the header and footer, scroll restoration on navigation, and a
 * short cross-fade between routes so a page change reads as a transition
 * rather than a flash.
 */

import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Outlet, useLocation } from 'react-router-dom';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';

/**
 * Jump to the top on navigation, but leave in-page anchors alone so a link
 * to #alumni still lands where it should.
 */
function useScrollRestoration() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, hash]);
}

export function PublicLayout() {
  const location = useLocation();
  const reducedMotion = useReducedMotion();
  useScrollRestoration();

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />

      <main id="main" className="flex flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            className="flex flex-1 flex-col"
            initial={reducedMotion ? undefined : { opacity: 0, y: 8 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            // Deliberately brief: a page transition that makes the visitor
            // wait is worse than none at all.
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <Footer />
    </div>
  );
}
