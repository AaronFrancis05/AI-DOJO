'use client';

import { useState } from 'react';
import { ChevronRightIcon } from '@/components/Icons';

/** Footer "Stay in the loop" signup.
 *  There is no newsletter endpoint under `app/api/` yet, so this only
 *  validates and acknowledges locally — wire the submit handler to a real
 *  route when one exists. */
export function FooterNewsletter() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  return (
    <div>
      <h3 className="text-sm font-semibold text-dojo-text-primary">Stay in the loop</h3>
      <p className="mt-4 text-sm leading-relaxed text-dojo-text-muted">
        Get language tips and product updates.
      </p>
      {submitted ? (
        <p className="mt-4 text-sm font-medium text-dojo-accent" role="status">
          Thanks &mdash; we&rsquo;ll be in touch.
        </p>
      ) : (
        <form
          className="relative mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
        >
          <label htmlFor="footer-newsletter-email" className="sr-only">
            Your email
          </label>
          <input
            id="footer-newsletter-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email"
            className="w-full rounded-lg border border-dojo-border bg-dojo-surface py-2.5 pl-4 pr-12 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent"
          />
          <button
            type="submit"
            aria-label="Subscribe"
            className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg bg-dojo-accent text-white transition-colors hover:bg-dojo-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  );
}
