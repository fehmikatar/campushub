import {
  Bell,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Clock,
  Eye,
  EyeOff,
  GraduationCap,
  House,
  LayoutGrid,
  Library,
  LogOut,
  MessageSquare,
  Search,
  ShieldAlert,
  Tags,
  Users,
} from 'lucide';
import { IconData } from './icon';

const icon = (data: unknown) => data as IconData;

export const Icons = {
  bell: icon(Bell),
  bookOpen: icon(BookOpen),
  chevronDown: icon(ChevronDown),
  clipboardList: icon(ClipboardList),
  clock: icon(Clock),
  eye: icon(Eye),
  eyeOff: icon(EyeOff),
  graduationCap: icon(GraduationCap),
  house: icon(House),
  layoutGrid: icon(LayoutGrid),
  library: icon(Library),
  logOut: icon(LogOut),
  messageSquare: icon(MessageSquare),
  search: icon(Search),
  shieldAlert: icon(ShieldAlert),
  tags: icon(Tags),
  users: icon(Users),
};
