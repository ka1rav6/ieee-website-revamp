/**
 * Shared pieces of the dashboard: page headers, labelled inputs, the modal
 * that every editor opens in, confirmation prompts and the image picker.
 *
 * Collected here so the nine management screens stay short and consistent,
 * and so accessibility details - focus trapping, labelling, destructive
 * confirmation - are implemented once rather than nine times.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { adminApi } from '@/api/endpoints';
import { useEscapeKey, useScrollLock } from '@/hooks/useInteraction';
import { useMutation } from '@/hooks/useAsync';
import { cx } from '@/utils/format';
import { mediaUrl } from '@/api/client';
import type { ApiError } from '@/api/client';
import { AlertIcon, CloseIcon, TrashIcon, UploadIcon } from '@/components/ui/Icons';

/* --- Page chrome -------------------------------------------------------- */

export function AdminHeader({
  title,
  description,
  count,
  action,
}: {
  title: string;
  description?: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          {count !== undefined && <span className="chip tabular">{count}</span>}
        </div>
        {description && <p className="max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}

/** A banner explaining that this screen's data also lives in content/. */
export function ContentFileNote({ file }: { file: string }) {
  return (
    <p className="mb-6 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-3 text-xs text-muted">
      Changes here are saved straight to the database. The same content can be edited in{' '}
      <code className="font-mono text-default">{file}</code> and loaded with{' '}
      <code className="font-mono text-default">just content-import</code>; run{' '}
      <code className="font-mono text-default">just content-export</code> to write your changes back
      into that file so they can be committed.
    </p>
  );
}

/* --- Form controls ------------------------------------------------------ */

interface LabelledProps {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  className?: string;
  children: (props: {
    id: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
    className: string;
  }) => ReactNode;
}

/** A label, a control, and whichever of hint and error apply. */
export function Labelled({ label, error, hint, optional, className, children }: LabelledProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {optional && <span className="ml-1.5 font-normal text-faint">(optional)</span>}
      </label>

      {children({
        id,
        'aria-invalid': error ? true : undefined,
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

/** A checkbox with its label, for the publish and feature flags. */
export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
      />
      <label htmlFor={id} className="cursor-pointer leading-tight">
        <span className="block text-sm font-medium text-strong">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </label>
    </div>
  );
}

/* --- Modal -------------------------------------------------------------- */

/**
 * A dialog for the editors.
 *
 * Focus moves in on open and returns to whatever opened it on close; Escape
 * and the backdrop both dismiss. Without that, a keyboard user would be left
 * tabbing through the page behind an open editor.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useScrollLock(open);
  useEscapeKey(onClose, open);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const firstField = panelRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button',
    );
    firstField?.focus();

    return () => previouslyFocused.current?.focus();
  }, [open]);

  // Keep Tab inside the dialog while it is open.
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <button
        type="button"
        className="fixed inset-0 bg-[color-mix(in_oklab,var(--surface-inverted)_55%,transparent)] backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
        tabIndex={-1}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className={cx(
          'relative my-auto w-full rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-raised)] shadow-[var(--shadow-lifted)]',
          wide ? 'max-w-4xl' : 'max-w-xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] p-5">
          <div className="space-y-1">
            <h2 id={titleId} className="font-display text-lg font-bold">
              {title}
            </h2>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-[var(--surface-sunken)] hover:text-strong"
            aria-label="Close"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="max-h-[calc(100dvh-16rem)] overflow-y-auto p-5">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--border-subtle)] p-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Confirmation before anything destructive.
 *
 * Deletions here are permanent and have no undo, so they always go through
 * an explicit prompt that names what is about to be removed.
 */
export function ConfirmDelete({
  open,
  onCancel,
  onConfirm,
  itemName,
  busy,
  note,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  itemName: string;
  busy?: boolean;
  note?: string;
}) {
  return (
    <Modal open={open} onClose={onCancel} title="Delete this permanently?">
      <div className="space-y-3">
        <p className="text-sm text-default">
          <span className="font-semibold text-strong">{itemName}</span> will be removed from the
          database. This cannot be undone.
        </p>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          Keep it
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
          <TrashIcon className="size-4" />
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}

/* --- Image picker ------------------------------------------------------- */

/**
 * Upload an image, or paste a path to one that already exists.
 *
 * Both are supported because imported content points at files under
 * /legacy/, which were never uploaded through this form.
 */
export function ImagePicker({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [upload, { submitting, error }] = useMutation(adminApi.uploads.create);

  const onFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const result = await upload(file);
      if (result) onChange(result.url);
      // Reset so picking the same file again still fires a change.
      event.target.value = '';
    },
    [upload, onChange],
  );

  return (
    <div>
      <span className="field-label">{label}</span>

      <div className="flex items-start gap-4">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
          {value ? (
            <img src={mediaUrl(value)} alt="" className="size-full object-cover" />
          ) : (
            <UploadIcon className="size-5 text-faint" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => inputRef.current?.click()}
              disabled={submitting}
            >
              <UploadIcon className="size-4" />
              {submitting ? 'Uploading…' : 'Upload'}
            </button>
            {value && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onChange(null)}
                disabled={submitting}
              >
                Remove
              </button>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={onFile}
            className="sr-only"
            aria-label={`Upload ${label.toLowerCase()}`}
          />

          <input
            type="text"
            value={value ?? ''}
            onChange={(event) => onChange(event.target.value.trim() || null)}
            placeholder="/uploads/… or /legacy/…"
            aria-label={`${label} path`}
            className="field font-mono text-xs"
          />

          {error && (
            <p className="field-error">
              <AlertIcon className="size-3.5 shrink-0" />
              {error.message}
            </p>
          )}
          {hint && !error && <p className="field-hint">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

/* --- Feedback ----------------------------------------------------------- */

/** A short-lived confirmation after a save. */
export function SavedToast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDone, 3000);
    return () => window.clearTimeout(timer);
  }, [message, onDone]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[color-mix(in_oklab,var(--color-signal-400)_45%,transparent)] bg-[var(--surface-raised)] px-5 py-2.5 text-sm font-medium shadow-[var(--shadow-lifted)]"
    >
      {message}
    </div>
  );
}

/** A tidy row of mutation errors above a form's actions. */
export function MutationError({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-[color-mix(in_oklab,var(--color-crimson-400)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-crimson-400)_10%,transparent)] px-3.5 py-3 text-sm"
    >
      <AlertIcon className="mt-0.5 size-4 shrink-0 text-[var(--color-crimson-400)]" />
      <span className="text-default">{error.message}</span>
    </div>
  );
}

/** A table that scrolls inside itself rather than widening the page. */
export function AdminTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="scroll-x">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
            {head}
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cx(
        'px-4 py-3 text-left font-mono text-[0.625rem] tracking-[0.1em] text-muted uppercase',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td className={cx('border-b border-[var(--border-subtle)] px-4 py-3 align-middle', className)}>
      {children}
    </td>
  );
}

/** A status pill that pairs a colour with a word, never colour alone. */
export function StatusPill({
  tone,
  children,
}: {
  tone: 'live' | 'draft' | 'muted';
  children: ReactNode;
}) {
  const styles = {
    live: 'border-[color-mix(in_oklab,var(--color-signal-400)_45%,transparent)] text-[var(--color-signal-400)]',
    draft:
      'border-[color-mix(in_oklab,var(--color-copper-400)_45%,transparent)] text-[var(--color-copper-400)]',
    muted: 'border-[var(--border-default)] text-muted',
  }[tone];

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[0.625rem] tracking-wider uppercase',
        styles,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Buttons to move a row up or down in an ordered listing. */
export function ReorderControls({
  onUp,
  onDown,
  disabledUp,
  disabledDown,
  label,
}: {
  onUp: () => void;
  onDown: () => void;
  disabledUp: boolean;
  disabledDown: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={onUp}
        disabled={disabledUp}
        aria-label={`Move ${label} up`}
        className="grid size-7 place-items-center rounded text-muted transition-colors hover:bg-[var(--surface-sunken)] hover:text-strong disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
          <path
            d="m6 15 6-6 6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={disabledDown}
        aria-label={`Move ${label} down`}
        className="grid size-7 place-items-center rounded text-muted transition-colors hover:bg-[var(--surface-sunken)] hover:text-strong disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

/** Shared state for a screen that opens an editor over a list. */
export function useEditor<T>() {
  const [editing, setEditing] = useState<T | null>(null);
  const [creating, setCreating] = useState(false);

  const open = useCallback((item: T) => setEditing(item), []);
  const create = useCallback(() => setCreating(true), []);
  const close = useCallback(() => {
    setEditing(null);
    setCreating(false);
  }, []);

  return { editing, creating, isOpen: creating || editing !== null, open, create, close };
}
