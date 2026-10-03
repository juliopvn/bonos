'use client';

import { useState } from 'react';
import { api } from '@/lib/client-api';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState('sending');
    try {
      await api('/api/auth/request', { body: { email } });
      setState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el enlace');
      setState('idle');
    }
  }

  if (state === 'sent') {
    return (
      <div role="status" data-testid="login-sent" className="mt-6 border-l-4 border-moss bg-white p-4">
        <p className="font-semibold">Revisa tu correo</p>
        <p className="muted mt-1 text-sm">
          Si <span className="num">{email}</span> puede acceder, ya tiene un enlace esperándole. Caduca en
          15 minutos.
        </p>
        <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={() => setState('idle')}>
          Usar otro correo
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <div className="field">
        <label htmlFor="email" className="label">
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          data-testid="login-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={error ? 'email-error' : undefined}
          aria-invalid={error ? true : undefined}
        />
        {error && (
          <p id="email-error" role="alert" className="field-error" data-testid="login-error">
            {error}
          </p>
        )}
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={state === 'sending'} data-testid="login-submit">
        {state === 'sending' ? 'Enviando…' : 'Enviarme el enlace'}
      </button>
    </form>
  );
}
