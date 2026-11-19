import { useMemo, useState } from 'react';
import { Button, DataTable, EmptyState, MetricCard, Modal, PageHeading, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { can, permissionsFor, PERMISSION_LABELS, roleMeta } from '../../utils/portal';
import { formErrorMessage } from '../../utils/workflows';

export function UsersPage({ user, administration, actions, onError, section = 'Users' }) {
  const { users, roles, departments } = administration;
  const tab = section;
  const canManageRoles = can(user, 'manageRoles');
  const [query, setQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [profile, setProfile] = useState(null);
  const [newRole, setNewRole] = useState(null);
  const [newDepartment, setNewDepartment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const results = useMemo(() => users.filter((item) => `${item.name} ${item.email} ${item.title}`.toLowerCase().includes(query.toLowerCase()) && (!departmentFilter || item.departmentId === departmentFilter) && (!roleFilter || item.roleId === roleFilter)), [users, query, departmentFilter, roleFilter]);
  const selectedRole = roles.find((role) => role.id === profile?.roleId);
  const startCreate = () => {
    setError('');
    setProfile({ name: '', email: '', title: '', roleId: 'employee', departmentId: departments[0]?.id ?? '', phone: '', startDate: '', password: '', active: true });
  };
  const saveProfile = async () => {
    try {
      setBusy(true); setError('');
      const { id, password, active, ...fields } = profile;
      const payload = { ...fields, startDate: fields.startDate || null, ...(password ? { password } : {}) };
      if (id) await actions.updateUser(id, { ...payload, active });
      else await actions.createUser(payload);
      setProfile(null);
      onError(id ? 'User profile updated' : 'User portal created. Share the initial password securely with the employee.');
    } catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  const saveRole = async () => {
    try { setBusy(true); setError(''); await actions.createRole(newRole); setNewRole(null); onError('Role created'); }
    catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  const saveDepartment = async () => {
    try { setBusy(true); setError(''); await actions.createDepartment({ name: newDepartment }); setNewDepartment(null); onError('Department created'); }
    catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };
  const editProfile = (item) => {
    setError('');
    setProfile({ id: item.id, name: item.name, email: item.email, title: item.title, roleId: item.roleId, departmentId: item.departmentId, phone: item.phone ?? '', startDate: item.startDate ?? '', password: '', active: item.active !== false });
  };

  return <>
    <PageHeading title={tab === 'Users' ? 'Employee profiles' : tab === 'Roles' ? 'Roles & permissions' : 'Departments'} description={tab === 'Users' ? (canManageRoles ? 'Create employee, trainer and management portals. Assign roles, departments and account access.' : 'Create and manage employee / trainer profiles. Privileged roles and administrator accounts are reserved for full administrators.') : tab === 'Roles' ? 'Create named role presets with an explicit, server-enforced permission level.' : 'Create departments and use them when assigning employee profiles.'} action={<Button variant="primary" onClick={startCreate}>Create employee profile</Button>} />
    <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3"><MetricCard label="Active users" value={users.filter((item) => item.active !== false).length} detail={`${users.length} total profiles`} /><MetricCard label="Roles" value={roles.length} detail="Named presets with explicit permission levels" /><MetricCard label="Departments" value={departments.length} detail="Available during profile creation" /></div>
    {tab === 'Users' && <Panel title="User profiles">
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3"><input aria-label="Search users" className="field-control" placeholder="Search name, email or job title" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filter users by role" className="field-control" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">All roles</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><select aria-label="Filter users by department" className="field-control" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div>
      {results.length ? <DataTable headings={['Employee', 'Role', 'Department', 'Portal access', 'Status', 'Actions']} rows={results.map((item) => ({ id: item.id, cells: [
        <span key="name"><b>{item.name}</b><small className="block text-muted">{item.email}</small><small className="block text-muted">{item.title}</small></span>, item.roleName ?? roleMeta[item.role].label, item.department,
        item.accessGroup === 'management' ? 'Admin / Management' : 'Employee / Trainer',
        <StatusBadge key="status" status={item.active !== false ? 'Active' : 'Offline'}>{item.active !== false ? 'Active' : 'Inactive'}</StatusBadge>,
        <Button small key="edit" onClick={() => editProfile(item)}>Edit profile</Button>
      ] }))} /> : <EmptyState>No profiles match your filters.</EmptyState>}
    </Panel>}
    {canManageRoles && tab === 'Roles' && <Panel title="Roles and permissions" action={<Button variant="primary" onClick={() => { setError(''); setNewRole({ name: '', baseRole: 'employee', description: '' }); }}>Create role</Button>}>
      <p className="mb-4 text-muted">Employees and trainers have self-service tools. Management reviews staff requests and administers employee / trainer profiles. Only administrators can assign privileged roles, create role presets, change organization settings or view the full audit trail.</p>
      <DataTable headings={['Role', 'Permission level', 'Users', 'Description']} rows={roles.map((role) => ({ id: role.id, cells: [<span key="name"><b>{role.name}</b>{role.system && <small className="block text-muted">Built-in role</small>}</span>, roleMeta[role.baseRole].label, users.filter((item) => item.roleId === role.id).length, <span key="description" className="inline-block max-w-[360px] whitespace-normal">{role.description}</span>] }))} />
    </Panel>}
    {tab === 'Departments' && <Panel title="Departments" action={<Button variant="primary" onClick={() => { setError(''); setNewDepartment(''); }}>Create department</Button>}><DataTable headings={['Department', 'Users']} rows={departments.map((department) => ({ id: department.id, cells: [department.name, users.filter((item) => item.departmentId === department.id).length] }))} /></Panel>}

    {profile && <Modal wide title={profile.id ? 'Edit employee profile' : 'Create employee profile'} confirmLabel={profile.id ? 'Save profile' : 'Create portal'} busy={busy} onClose={() => setProfile(null)} onConfirm={saveProfile}>
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <div><label className="field-label" htmlFor="user-name">Full name</label><input id="user-name" className="field-control" required maxLength={100} autoComplete="name" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></div>
        <div><label className="field-label" htmlFor="user-email">Work email</label><input id="user-email" className="field-control" required type="email" maxLength={254} autoComplete="off" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} /></div>
        <div><label className="field-label" htmlFor="user-title">Job title</label><input id="user-title" className="field-control" required maxLength={100} value={profile.title} onChange={(event) => setProfile({ ...profile, title: event.target.value })} /></div>
        <div><label className="field-label" htmlFor="user-phone">Work phone (optional)</label><input id="user-phone" className="field-control" type="tel" maxLength={40} value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></div>
        <div><label className="field-label" htmlFor="user-role">Role</label><select id="user-role" className="field-control" required disabled={profile.id === user.id} value={profile.roleId} onChange={(event) => setProfile({ ...profile, roleId: event.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div>
        <div><label className="field-label" htmlFor="user-department">Department</label><select id="user-department" className="field-control" required value={profile.departmentId} onChange={(event) => setProfile({ ...profile, departmentId: event.target.value })}><option value="" disabled>Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div>
        <div><label className="field-label" htmlFor="user-start">Start date (optional)</label><input id="user-start" className="field-control" type="date" value={profile.startDate} onChange={(event) => setProfile({ ...profile, startDate: event.target.value })} /></div>
        <div><label className="field-label" htmlFor="user-password">{profile.id ? 'New password (leave blank to keep)' : 'Initial password'}</label><input id="user-password" className="field-control" type="password" required={!profile.id} minLength={10} maxLength={200} autoComplete="new-password" value={profile.password} onChange={(event) => setProfile({ ...profile, password: event.target.value })} /></div>
      </div>
      {selectedRole && <div className="mt-4 rounded-lg bg-accent-soft p-3 text-xs text-accent"><b>Permission level: {roleMeta[selectedRole.baseRole].label}</b><p className="mb-0">Sign in through <b>{['admin', 'manager'].includes(selectedRole.baseRole) ? 'Admin / Management' : 'Employee / Trainer'}</b>. {selectedRole.description}</p></div>}
      {!profile.id && <p className="text-xs text-muted">Use at least 10 characters. Share the initial password securely; the portal does not email credentials.</p>}
      {profile.id && <label className="mt-4 flex items-center gap-2"><input type="checkbox" checked={profile.active} disabled={profile.id === user.id} onChange={(event) => setProfile({ ...profile, active: event.target.checked })} />Account active <span className="text-xs text-muted">(inactive users cannot sign in)</span></label>}
      {error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}
    </Modal>}
    {canManageRoles && newRole && <Modal title="Create role" confirmLabel="Create role" busy={busy} onClose={() => setNewRole(null)} onConfirm={saveRole}>
      <label className="field-label" htmlFor="role-name">Role name</label><input id="role-name" className="field-control" required minLength={2} maxLength={80} value={newRole.name} onChange={(event) => setNewRole({ ...newRole, name: event.target.value })} />
      <label className="field-label" htmlFor="role-permissions">Permission level</label><select id="role-permissions" className="field-control" value={newRole.baseRole} onChange={(event) => setNewRole({ ...newRole, baseRole: event.target.value })}>{Object.entries(roleMeta).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select>
      <p className="rounded-lg bg-accent-soft p-3 text-xs text-accent">{roles.find((role) => role.id === newRole.baseRole)?.description}</p>
      <ul className="space-y-1 pl-4 text-xs text-muted">{permissionsFor(newRole.baseRole).map((permission) => <li key={permission}>{PERMISSION_LABELS[permission]}</li>)}</ul>
      <label className="field-label" htmlFor="role-description">Description (optional)</label><textarea id="role-description" className="field-control" rows="3" maxLength={300} value={newRole.description} onChange={(event) => setNewRole({ ...newRole, description: event.target.value })} />
      {error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}
    </Modal>}
    {newDepartment !== null && <Modal title="Create department" confirmLabel="Create department" busy={busy} onClose={() => setNewDepartment(null)} onConfirm={saveDepartment}><label className="field-label" htmlFor="department-name">Department name</label><input id="department-name" className="field-control" required minLength={2} maxLength={100} value={newDepartment} onChange={(event) => setNewDepartment(event.target.value)} />{error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}</Modal>}
  </>;
}
