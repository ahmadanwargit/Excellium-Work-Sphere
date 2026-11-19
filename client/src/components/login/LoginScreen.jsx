import { useState } from 'react';
import { Logo } from '../common/Logo';
import { Icon } from '../common/Icon';
import { accessGroupMeta, roleMeta } from '../../utils/portal';
import officeBackground from '../../assets/office-bg.jpg';

const featurePills = ['Real-time Attendance', 'Payroll & Invoices', 'Asset Tracking'];

export function LoginScreen({ onLogin, connectionError }) {
  const [accessGroup, setAccessGroup] = useState('employee');
  const [email, setEmail] = useState(accessGroupMeta.employee.email);
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [showResetNote, setShowResetNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectAccessGroup = (nextAccessGroup) => {
    setAccessGroup(nextAccessGroup);
    setEmail(accessGroupMeta[nextAccessGroup].email);
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try { await onLogin({ email, password, accessGroup }); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  };

  return (
    <div className="login-page min-h-screen text-[#e7e3f2]" style={{ '--login-bg-image': `url(${officeBackground})` }}>
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-6 py-6 md:px-12 md:py-8">
        <header className="flex items-center justify-between gap-4">
          <Logo />
          <span className="flex items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/[.05] px-3.5 py-1.5 text-xs text-[#b7b1cc] backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#34d399] shadow-[0_0_8px_#34d399]" />
            Workspace Portal v2.4
          </span>
        </header>

        <div className="grid flex-1 grid-cols-1 items-center gap-12 py-12 lg:grid-cols-[1fr_auto] lg:gap-10 lg:py-6">
          <section className="max-w-[640px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#8b5cf6]/30 bg-[#8b5cf6]/[.12] px-3.5 py-1.5 text-xs font-medium text-[#c4b5fd]">
              <Icon name="shield" size={13} />
              Unified Enterprise Operations
            </span>
            <h1 className="m-0 mt-6 max-w-[12.5em] text-[38px] font-bold leading-[1.12] tracking-[-.02em] text-white md:text-[52px]">
              One workspace for attendance, pay, performance and equipment.
            </h1>
            <p className="m-0 mt-5 max-w-[32em] text-[15px] leading-relaxed text-[#a49dbd]">
              Choose your access category to see the tools and numbers that matter for your work.
            </p>
            <div className="mt-9 flex flex-wrap gap-2.5">
              {featurePills.map((feature) => (
                <span key={feature} className="rounded-full border border-white/10 bg-white/[.06] px-4 py-2 text-[13px] text-[#cdc7e0] backdrop-blur-sm">{feature}</span>
              ))}
            </div>
          </section>

          <form
            className="mx-auto w-full max-w-[440px] rounded-[26px] border border-white/[.09] bg-[#14101f]/[.94] p-7 shadow-[0_30px_80px_-20px_rgb(0_0_0/.75)] backdrop-blur-md md:p-9 lg:mx-0 lg:justify-self-end"
            onSubmit={submit}
          >
            <h2 className="m-0 text-[26px] font-semibold tracking-[-.01em] text-white">Sign in</h2>
            <p className="m-0 mt-1 text-sm text-[#9a92b3]">Choose your access category</p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              {Object.entries(accessGroupMeta).map(([key, item]) => {
                const selected = accessGroup === key;
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => selectAccessGroup(key)}
                    aria-pressed={selected}
                    disabled={busy}
                    className={`relative rounded-2xl border p-4 text-left transition ${selected ? 'border-[#8b5cf6] bg-[#8b5cf6]/[.13] shadow-[0_0_0_1px_#8b5cf6_inset]' : 'border-white/10 bg-white/[.03] hover:border-white/25'}`}
                  >
                    {selected && <span className="absolute right-3.5 top-3.5 h-2 w-2 rounded-full bg-[#a78bfa] shadow-[0_0_8px_#a78bfa]" />}
                    <b className="block pr-4 text-[14px] font-semibold leading-tight text-white">{item.label}</b>
                    <small className="mt-1.5 block text-[11.5px] leading-snug text-[#8f88a8]">{item.description}</small>
                  </button>
                );
              })}
            </div>

            <label className="login-label" htmlFor="email">Work email</label>
            <input className="login-input" id="email" type="email" autoComplete="username" disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} required />

            <div className="mt-4 flex items-center justify-between">
              <label className="login-label !mt-0 !mb-0" htmlFor="password">Password</label>
              <button type="button" className="p-0 text-xs font-medium text-[#a78bfa] transition hover:text-[#c4b5fd]" onClick={() => setShowResetNote((value) => !value)}>
                Forgot password?
              </button>
            </div>
            <div className="relative mt-1.5">
              <input
                className="login-input pr-11"
                id="password"
                autoComplete="current-password"
                disabled={busy}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#7d7596] transition hover:text-white"
                onClick={() => setShowPassword((value) => !value)}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} />
              </button>
            </div>
            {showResetNote && <p className="m-0 mt-2 text-xs leading-relaxed text-[#8f88a8]">Password resets are handled by your workspace administrator.</p>}

            {(error || connectionError) && <p role="alert" className="m-0 mt-3 text-sm text-[#f08a82]">{error || connectionError}</p>}

            <button className="login-submit mt-6 w-full rounded-xl py-3.5 text-[15px] font-semibold" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            <div className="mt-6 flex items-center justify-between border-t border-white/[.07] pt-4 text-xs text-[#8f88a8]">
              <span className="flex items-center gap-1.5">
                <Icon name="lock" size={13} />
                Secure session sign-in
              </span>
              <span>{accessGroup === 'employee' ? 'Personal workspace' : 'Management workspace'}</span>
            </div>
            <p className="mb-0 mt-3 text-[11px] leading-relaxed text-[#9a92b3]">Your saved account role determines access. This category does not grant administrator permissions.</p>
            <div className="mt-4 border-t border-white/[.07] pt-3"><small className="block text-[10px] uppercase tracking-wide text-[#8f88a8]">Preview a demo role</small><div className="mt-2 flex flex-wrap gap-2">{Object.entries(roleMeta).filter(([role]) => accessGroup === 'management' ? ['manager', 'admin'].includes(role) : ['employee', 'trainer'].includes(role)).map(([role, item]) => <button key={role} type="button" disabled={busy} className="rounded-lg border border-white/10 bg-white/[.03] px-2.5 py-1.5 text-[11px] text-[#c4b5fd] hover:border-[#8b5cf6]" onClick={() => { setEmail(item.email); setPassword('password123'); setError(''); }}>{item.label} demo</button>)}</div></div>
          </form>
        </div>

        <p className="m-0 pb-1 text-center text-xs text-[#6f6884]">
          Demo environment — use the prefilled account with password <code className="text-[#9a92b3]">password123</code>.
        </p>
      </div>
    </div>
  );
}
