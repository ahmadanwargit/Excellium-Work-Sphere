import { useMemo, useState } from 'react';
import { PageHeading } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { initials } from '../../utils/portal';

export function DirectoryPage({ people }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => people.filter((person) => `${person.name}${person.department}`.toLowerCase().includes(query.toLowerCase())), [people, query]);
  return <>
    <PageHeading title="Employee directory" description="Find colleagues by name or department." />
    <input className="field-control mb-4 max-w-[320px]" placeholder="Search people" value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{results.map((person) => <article className="panel flex items-center gap-3" key={person.id}><span className="grid h-[38px] w-[38px] place-items-center rounded-xl border border-line bg-accent-soft font-semibold text-accent">{initials(person.name)}</span><div>{person.name}<small className="block text-muted">{person.department}</small><StatusBadge status="Present">{person.role}</StatusBadge></div></article>)}</div>
    {!results.length && <p className="text-muted">No one matches that search.</p>}
  </>;
}
