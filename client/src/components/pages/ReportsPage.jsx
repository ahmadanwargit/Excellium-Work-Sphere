import { useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';
import { Button, PageHeading, Panel } from '../common/UI';

const reportTypes = ['Attendance', 'Payroll', 'Performance', 'Equipment', 'Meetings'];

export function ReportsPage({ onError }) {
  const [type, setType] = useState('Attendance');
  const [points, setPoints] = useState([]);
  useEffect(() => {
    apiRequest(`/api/reports?type=${type}`).then((result) => setPoints(result.points)).catch((error) => onError(error.message));
  }, [onError, type]);
  const maximum = Math.max(1, ...points.map((point) => point.value));
  return <>
    <PageHeading title="Reports and analytics" description="Company-wide trends." action={<Button onClick={() => onError('Report exported')}>Export</Button>} />
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">{reportTypes.map((item) => <button className={`tab-button ${type === item ? 'tab-button-active' : ''}`} key={item} onClick={() => setType(item)}>{item}</button>)}</div>
    <Panel title={`${type} trend`}><div className="flex h-[180px] items-end gap-2.5 pt-2.5">{points.map((point) => <div className="chart-column" key={point.label}><i className="chart-column-bar" style={{ height: `${point.value / maximum * 100}%` }} />{point.label}</div>)}</div></Panel>
  </>;
}
