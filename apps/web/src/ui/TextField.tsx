import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { AlertIcon } from './icons';
import s from './TextField.module.css';

export type TextFieldProps = Omit<ComponentPropsWithRef<'input'>, 'children'> & {
  label: string;
  hideLabel?: boolean;
  error?: string;
  labelAside?: ReactNode;
  trailing?: ReactNode;
};

export function TextField({
  label,
  hideLabel = false,
  error,
  labelAside,
  trailing,
  id,
  className,
  type = 'text',
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  const labelEl = (
    <label htmlFor={inputId} className={hideLabel ? s.hidden : s.label}>
      {label}
    </label>
  );
  return (
    <div className={className}>
      {labelAside && !hideLabel ? (
        <div className={s.labelRow}>
          {labelEl}
          {labelAside}
        </div>
      ) : (
        labelEl
      )}
      <div className={s.control}>
        <input
          id={inputId}
          type={type}
          className={[s.input, error && s.invalid, trailing && s.withTrailing].filter(Boolean).join(' ')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...rest}
        />
        {trailing && <div className={s.trailing}>{trailing}</div>}
      </div>
      {error && (
        <p id={errorId} role="alert" className={s.error}>
          <AlertIcon />
          {error}
        </p>
      )}
    </div>
  );
}
