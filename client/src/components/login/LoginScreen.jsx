import { useState } from 'react';
import { Logo } from '../common/Logo';
import { Button } from '../common/UI';
import { roleMeta } from '../../utils/portal';

export function LoginScreen({ onLogin }) {
  const [role, setRole] = useState('employee');
  const [email, setEmail] = useState(roleMeta.employee.email);
  const [password, setPassword] = useState('password123');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectRole = (nextRole) => {
    setRole(nextRole);
    setEmail(roleMeta[nextRole].email);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try { await onLogin({ email, password, role }); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  };

  return <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
    <aside className="hidden flex-col justify-between bg-[radial-gradient(circle_at_15%_95%,#6D3FC866,transparent_55%),radial-gradient(circle_at_90%_8%,#A78BFA2e,transparent_45%),#111820] p-14 text-[#e7eeeb] lg:flex">
      <Logo large />
      <div><h1 className="m-0 max-w-[14em] text-[34px] font-semibold leading-[1.2]">One workspace for attendance, pay, performance and equipment.</h1><p className="mt-3.5 max-w-[30em] text-[#92a19a]">Sign in with your role to see the tools and numbers that matter for your work.</p></div>
      <small className="text-[#92a19a]">Demo environment. Use the prefilled account and password: password123.</small>
    </aside>
    <main className="flex items-center justify-center p-8"><form className="w-full max-w-[380px]" onSubmit={submit}>
      <div className="mb-7"><Logo light={false} /></div>
      <h2 className="m-0 mb-1 text-[22px] font-semibold">Sign in</h2><p className="m-0 text-muted">Choose how you work at the company.</p>
      <div className="my-[18px] grid grid-cols-2 gap-2">{Object.entries(roleMeta).map(([key, item]) => <button type="button" key={key} onClick={() => selectRole(key)} className={`rounded-md border p-2.5 text-left ${role === key ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}><b className="block font-semibold">{item.label}</b><small className="text-muted">{item.description}</small></button>)}</div>
      <label className="field-label" htmlFor="email">Work email</label><input className="field-control" id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <label className="field-label" htmlFor="password">Password</label><input className="field-control" id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      {error && <p className="mb-0 mt-3 text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>}
      <Button variant="primary" className="mt-[18px] w-full py-[11px]" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
    </form></main>
  </div>;
}
