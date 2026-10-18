import { useState } from 'react';
import type { AuthState } from '../hooks/useAuth';
import type { SyncStatus } from '../hooks/useProgress';
import { Dialog } from './Dialog';

interface Props {
  open: boolean;
  onClose: () => void;
  auth: AuthState;
  syncStatus: SyncStatus;
  onSyncNow: () => void;
}

export function AccountDialog({ open, onClose, auth, syncStatus, onSyncNow }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await auth.login(username, password);
      else await auth.register(username, password);
      setPassword('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} title="Konto i synchronizacja" onClose={onClose}>
      {!auth.serverAvailable ? (
        <p>
          Serwer kont jest niedostępny, więc postęp zapisuje się tylko w tej przeglądarce. Uruchom aplikację poleceniem{' '}
          <code>npm run dev</code> lub <code>npm start</code>, aby włączyć konta. Kopię postępu możesz też wyeksportować w zakładce „Dane”.
        </p>
      ) : auth.user ? (
        <div className="stack">
          <p>
            Zalogowano jako <strong>{auth.user.username}</strong>. Postęp jest zapisywany lokalnie i synchronizowany z kontem między urządzeniami.
          </p>
          <p className="muted">Status: {syncStatus === 'synced' ? 'zsynchronizowano' : syncStatus === 'syncing' ? 'synchronizacja…' : syncStatus === 'error' ? 'błąd — spróbujemy ponownie' : 'lokalnie'}</p>
          <div className="details__actions">
            <button type="button" className="btn btn--ghost" onClick={onSyncNow}>
              Synchronizuj teraz
            </button>
            <button type="button" className="btn btn--danger" onClick={() => void auth.logout()}>
              Wyloguj
            </button>
          </div>
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
              Logowanie
            </button>
            <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
              Rejestracja
            </button>
          </div>
          <p className="muted small">Bez konta postęp zapisuje się w tej przeglądarce. Po zalogowaniu lokalny postęp zostanie połączony z kontem.</p>
          <label className="field">
            <span>Nazwa użytkownika</span>
            <input className="input" autoComplete="username" required minLength={3} maxLength={32} value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="field">
            <span>Hasło</span>
            <input
              className="input"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {mode === 'login' ? 'Zaloguj' : 'Utwórz konto'}
          </button>
        </form>
      )}
    </Dialog>
  );
}
