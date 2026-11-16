import { PageHeading, Panel } from '../common/UI';
import { initials, people } from '../../utils/portal';

export function RankingsPage({ trainer = false }) {
  const sorted = [...people].sort((left, right) => right[3] - left[3]);
  return <>
    <PageHeading title="Performance and rankings" description={trainer ? 'Trainee and team scores.' : 'Scores combine attendance, delivery and peer feedback.'} />
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Panel title="Leaderboard">{sorted.map(([name, department, , score], index) => <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0" key={name}><span className="flex items-center gap-3"><b className="w-5">{index + 1}</b><span className="grid h-[38px] w-[38px] place-items-center rounded-xl border border-line bg-accent-soft font-semibold text-accent">{initials(name)}</span><span>{name}<small className="block text-muted">{department}</small></span></span><span className="flex w-[40%] items-center gap-2.5"><span className="h-[7px] flex-1 overflow-hidden rounded bg-line"><i className="progress-value" style={{ width: `${score}%` }} /></span><b>{score}</b></span></div>)}</Panel><Panel title="Score by department"><DepartmentChart /></Panel></div>
  </>;
}

function DepartmentChart() {
  const scores = [['Eng', 89], ['Design', 96], ['Fin', 89], ['Sales', 78], ['Ops', 87]];
  return <div className="flex h-[150px] items-end gap-2.5 pt-2.5">{scores.map(([label, score]) => <div className="chart-column" key={label}><i className="chart-column-bar" style={{ height: `${score / 96 * 100}%` }} />{label}</div>)}</div>;
}
