import {
  Bell, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, Clock3, Eye, EyeOff, FileText, Gauge,
  LayoutDashboard, Lock, Menu, MonitorCog, Settings, ShieldCheck, Trophy, UserRound, UsersRound, X
} from 'lucide-react';

const icons = {
  dashboard: LayoutDashboard,
  attendance: Clock3,
  invoices: FileText,
  rankings: Trophy,
  meetings: CalendarDays,
  leaves: CalendarDays,
  users: UsersRound,
  equipment: MonitorCog,
  directory: UsersRound,
  reports: ChartNoAxesCombined,
  notifications: Bell,
  settings: Settings,
  menu: Menu,
  close: X,
  work: BriefcaseBusiness,
  profile: UserRound,
  gauge: Gauge,
  shield: ShieldCheck,
  lock: Lock,
  eye: Eye,
  eyeOff: EyeOff
};

export function Icon({ name, size = 17, className = '' }) {
  const Component = icons[name] ?? LayoutDashboard;
  return <Component size={size} strokeWidth={1.7} className={className} aria-hidden="true" />;
}
