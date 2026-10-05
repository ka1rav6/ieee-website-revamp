/**
 * /contact - one form, two framings.
 *
 * "Contact us" and "Collaborate with us" are the same endpoint with a
 * different default enquiry type and different copy, because splitting them
 * into two forms would duplicate every field and double the validation for
 * no benefit to the sender.
 *
 * Validation runs on both sides: here for immediate feedback, and on the
 * server, which is what actually decides. Server field errors are merged in
 * so a rule only the backend knows about still lands beside the right input.
 */

import { useCallback, useMemo, useState } from 'react';
import { publicApi } from '@/api/endpoints';
import { useMutation } from '@/hooks/useAsync';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { INQUIRY_TYPE_LABELS, cx } from '@/utils/format';
import { Seo } from '@/components/Seo';
import { PageHeader, Section } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { FormError } from '@/components/ui/States';
import {
  AlertIcon,
  CheckIcon,
  MailIcon,
  MapPinIcon,
  SparkIcon,
  UsersIcon,
} from '@/components/ui/Icons';
import type { InquiryType } from '@/types/api';

type Mode = 'contact' | 'collaborate';

const MIN_MESSAGE_LENGTH = 20;
const MAX_MESSAGE_LENGTH = 5000;

/** Enquiry types offered in each mode. */
const MODE_OPTIONS: Record<Mode, InquiryType[]> = {
  contact: ['general', 'membership', 'other'],
  collaborate: ['industry_collaboration', 'event_sponsorship', 'workshop', 'talk', 'research'],
};

interface FormValues {
  name: string;
  email: string;
  organization: string;
  phone: string;
  inquiry_type: InquiryType;
  subject: string;
  message: string;
}

const EMPTY_FORM: FormValues = {
  name: '',
  email: '',
  organization: '',
  phone: '',
  inquiry_type: 'general',
  subject: '',
  message: '',
};

/**
 * Client-side rules, mirroring the backend's Pydantic schema.
 *
 * Deliberately permissive on email: anything stricter than "has a name, an
 * @ and a domain" rejects addresses that are actually valid.
 */
function validate(values: FormValues, mode: Mode): Partial<Record<keyof FormValues, string>> {
  const errors: Partial<Record<keyof FormValues, string>> = {};

  if (values.name.trim().length < 2) {
    errors.name = 'Please enter your name.';
  }

  if (!values.email.trim()) {
    errors.email = 'Please enter your email address.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'That does not look like a valid email address.';
  }

  if (values.phone.trim() && !/^[\d+()\-. ]+$/.test(values.phone.trim())) {
    errors.phone = 'Use digits, spaces and + ( ) - only.';
  }

  const message = values.message.trim();
  if (message.length < MIN_MESSAGE_LENGTH) {
    errors.message = `Please write at least ${MIN_MESSAGE_LENGTH} characters so we can help properly.`;
  } else if (message.length > MAX_MESSAGE_LENGTH) {
    errors.message = `Please keep this under ${MAX_MESSAGE_LENGTH} characters.`;
  }

  // An organisation is the whole point of a collaboration enquiry.
  if (mode === 'collaborate' && !values.organization.trim()) {
    errors.organization = 'Please tell us which organisation you are with.';
  }

  return errors;
}

/* --- Field primitives --------------------------------------------------- */

interface FieldProps {
  id: keyof FormValues;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
    className: string;
  }) => React.ReactNode;
}

function Field({ id, label, error, hint, optional, children }: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  // Point the input at whichever descriptions exist, so a screen reader
  // announces the hint and the error together with the label.
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
        {optional && <span className="ml-1.5 font-normal text-faint">(optional)</span>}
      </label>

      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy || undefined,
        className: cx('field', error && 'field-invalid'),
      })}

      {hint && !error && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          <AlertIcon className="size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/* --- Page --------------------------------------------------------------- */

export default function ContactPage() {
  const { text } = useSiteSettings();
  const [mode, setMode] = useState<Mode>('contact');
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [clientErrors, setClientErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [submitted, setSubmitted] = useState(false);

  const [submit, { submitting, error, fieldErrors }] = useMutation(publicApi.submitContact);

  const errors = useMemo(() => ({ ...fieldErrors, ...clientErrors }), [fieldErrors, clientErrors]);

  const update = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    // Clear the error for a field as soon as the sender starts fixing it;
    // leaving it there while they type is needlessly discouraging.
    setClientErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setValues((current) => ({
      ...current,
      inquiry_type: MODE_OPTIONS[next][0] ?? 'general',
    }));
    setClientErrors({});
  }, []);

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const found = validate(values, mode);
      setClientErrors(found);
      if (Object.keys(found).length > 0) {
        // Move focus to the first problem so a keyboard or screen-reader
        // user is taken straight to it.
        const firstKey = Object.keys(found)[0];
        if (firstKey) document.getElementById(firstKey)?.focus();
        return;
      }

      const result = await submit({
        name: values.name.trim(),
        email: values.email.trim(),
        organization: values.organization.trim() || null,
        phone: values.phone.trim() || null,
        inquiry_type: values.inquiry_type,
        subject: values.subject.trim() || null,
        message: values.message.trim(),
      });

      if (result) {
        setSubmitted(true);
        setValues({ ...EMPTY_FORM, inquiry_type: MODE_OPTIONS[mode][0] ?? 'general' });
      }
    },
    [values, mode, submit],
  );

  const email = text('contact_email', 'ieee@iiitd.ac.in');
  const address = text(
    'contact_address',
    'IIIT Delhi, Okhla Industrial Estate, Phase III, New Delhi 110020',
  );

  const messageLength = values.message.trim().length;

  return (
    <>
      <Seo
        title="Contact"
        description="Get in touch with the IEEE student branch at IIIT Delhi, or propose a collaboration, sponsorship, workshop or talk."
        canonicalPath="/contact"
      />

      <PageHeader
        eyebrow="Contact"
        title={text('contact_heading', "Let's build something together.")}
        description={text(
          'contact_body',
          'Whether you are a student with a question or an organisation looking to collaborate, this reaches the branch directly.',
        )}
      />

      <Section compact>
        <div className="shell grid gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            {/* Two tabs over one form. */}
            <div
              role="tablist"
              aria-label="What are you getting in touch about?"
              className="mb-8 grid grid-cols-2 gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-1.5"
            >
              {(
                [
                  { id: 'contact', label: 'Contact us', icon: <MailIcon className="size-4" /> },
                  {
                    id: 'collaborate',
                    label: 'Collaborate with us',
                    icon: <SparkIcon className="size-4" />,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === tab.id}
                  aria-controls="contact-form"
                  onClick={() => switchMode(tab.id)}
                  className={cx(
                    'flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors duration-200',
                    mode === tab.id
                      ? 'bg-[var(--surface-raised)] text-strong shadow-[var(--shadow-card)]'
                      : 'text-muted hover:text-strong',
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {submitted ? (
              <Reveal>
                <div className="card space-y-5 p-8 text-center">
                  <span
                    className="mx-auto grid size-12 place-items-center rounded-full bg-[color-mix(in_oklab,var(--color-signal-400)_16%,transparent)] text-[var(--color-signal-400)]"
                    aria-hidden="true"
                  >
                    <CheckIcon className="size-6" />
                  </span>
                  <div className="space-y-2">
                    <h2 className="fluid-subheading font-semibold">Message sent</h2>
                    <p className="mx-auto max-w-sm text-muted">
                      Thank you. The branch has your message and will reply to the address you gave
                      us.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setSubmitted(false)}
                  >
                    Send another message
                  </button>
                </div>
              </Reveal>
            ) : (
              <form
                id="contact-form"
                onSubmit={onSubmit}
                // Browser-native bubbles would duplicate our own messages.
                noValidate
                className="card space-y-5 p-6 md:p-8"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="name" label="Your name" error={errors.name}>
                    {(props) => (
                      <input
                        {...props}
                        type="text"
                        name="name"
                        autoComplete="name"
                        maxLength={160}
                        value={values.name}
                        onChange={(event) => update('name', event.target.value)}
                      />
                    )}
                  </Field>

                  <Field id="email" label="Email address" error={errors.email}>
                    {(props) => (
                      <input
                        {...props}
                        type="email"
                        name="email"
                        autoComplete="email"
                        maxLength={255}
                        value={values.email}
                        onChange={(event) => update('email', event.target.value)}
                      />
                    )}
                  </Field>

                  <Field
                    id="organization"
                    label="Organisation"
                    error={errors.organization}
                    optional={mode === 'contact'}
                  >
                    {(props) => (
                      <input
                        {...props}
                        type="text"
                        name="organization"
                        autoComplete="organization"
                        maxLength={200}
                        value={values.organization}
                        onChange={(event) => update('organization', event.target.value)}
                      />
                    )}
                  </Field>

                  <Field id="phone" label="Phone" error={errors.phone} optional>
                    {(props) => (
                      <input
                        {...props}
                        type="tel"
                        name="phone"
                        autoComplete="tel"
                        maxLength={40}
                        value={values.phone}
                        onChange={(event) => update('phone', event.target.value)}
                      />
                    )}
                  </Field>
                </div>

                <Field id="inquiry_type" label="What is this about?" error={errors.inquiry_type}>
                  {(props) => (
                    <select
                      {...props}
                      name="inquiry_type"
                      value={values.inquiry_type}
                      onChange={(event) =>
                        update('inquiry_type', event.target.value as InquiryType)
                      }
                    >
                      {MODE_OPTIONS[mode].map((option) => (
                        <option key={option} value={option}>
                          {INQUIRY_TYPE_LABELS[option] ?? option}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>

                <Field id="subject" label="Subject" error={errors.subject} optional>
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      name="subject"
                      maxLength={250}
                      placeholder={
                        mode === 'collaborate'
                          ? 'e.g. Sponsoring your next hackathon'
                          : 'e.g. Question about membership'
                      }
                      value={values.subject}
                      onChange={(event) => update('subject', event.target.value)}
                    />
                  )}
                </Field>

                <Field
                  id="message"
                  label="Message"
                  error={errors.message}
                  hint={`${messageLength} of ${MAX_MESSAGE_LENGTH} characters`}
                >
                  {(props) => (
                    <textarea
                      {...props}
                      name="message"
                      rows={6}
                      maxLength={MAX_MESSAGE_LENGTH}
                      placeholder={
                        mode === 'collaborate'
                          ? 'Tell us what you have in mind, roughly when, and what you would need from the branch.'
                          : 'What would you like to know?'
                      }
                      value={values.message}
                      onChange={(event) => update('message', event.target.value)}
                      className={cx(props.className, 'resize-y')}
                    />
                  )}
                </Field>

                <FormError error={error} />

                {error?.isRateLimited && (
                  <p className="text-sm text-muted">
                    If this is urgent, email{' '}
                    <a href={`mailto:${email}`} className="text-accent underline">
                      {email}
                    </a>{' '}
                    directly.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
                    {submitting ? 'Sending…' : 'Send message'}
                  </button>
                  <p className="text-xs text-faint">
                    We only use your details to reply to this message.
                  </p>
                </div>
              </form>
            )}
          </div>

          <aside className="space-y-5 lg:col-span-5">
            <div className="card space-y-4 p-6">
              <h2 className="text-base font-semibold">Reach us directly</h2>
              <ul className="space-y-3.5 text-sm">
                <li>
                  <a
                    href={`mailto:${email}`}
                    className="group flex items-start gap-3 text-muted transition-colors hover:text-strong"
                  >
                    <MailIcon className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span className="break-all">{email}</span>
                  </a>
                </li>
                <li className="flex items-start gap-3 text-muted">
                  <MapPinIcon className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span>{address}</span>
                </li>
              </ul>
            </div>

            <div className="card space-y-3 p-6">
              <h2 className="flex items-center gap-2.5 text-base font-semibold">
                <UsersIcon className="size-5 text-emphasis" />
                Looking to join instead?
              </h2>
              <p className="text-sm text-muted">
                Membership opens at the start of each academic year, and the application form is
                linked from the top of every page.
              </p>
            </div>

            <div className="card space-y-3 p-6">
              <h2 className="text-base font-semibold">What happens next</h2>
              <ol className="space-y-3 text-sm text-muted">
                {[
                  'Your message is recorded and the branch is notified.',
                  'Someone from the relevant team reads it.',
                  'You get a reply at the address you gave us.',
                ].map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span
                      className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--surface-sunken)] font-mono text-[0.625rem] text-accent"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
