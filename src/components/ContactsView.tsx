import { useMemo, useState } from 'react';
import { Search, UserRoundPlus } from 'lucide-react';
import type { Student, StudentRegistrationInput, UserRole } from '../types';
import { StudentRegistrationPage } from './StudentRegistrationPage';

interface Props { students: Student[]; userRole: UserRole; onRegister: (student: StudentRegistrationInput) => Promise<void>; }

export function ContactsView({ students, userRole, onRegister }: Props) {
  const [search, setSearch] = useState('');
  const [registering, setRegistering] = useState(false);
  const contacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter((student) => !query || `${student.first_name} ${student.last_name} ${student.email} ${student.whatsapp || ''} ${student.certification_agency || ''} ${student.certification_level || ''}`.toLowerCase().includes(query));
  }, [students, search]);
  if (registering) return <StudentRegistrationPage userRole={userRole} onRegister={async (student) => { await onRegister(student); setRegistering(false); }} onCancel={() => setRegistering(false)} />;

  return <section className="space-y-5 rounded-2xl bg-[#1D293D] p-4 sm:p-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold tracking-tight text-white">Contacts</h1><p className="mt-1 text-sm text-slate-300">Registered students and customer contact details · {students.length} on file.</p></div>
      <div className="flex w-full flex-wrap gap-3 sm:w-auto"><label className="relative min-w-[240px] flex-1 sm:flex-none"><span className="sr-only">Search contacts</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, WhatsApp, certification" className="min-h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label><button type="button" onClick={() => setRegistering(true)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#4C8BF5] px-4 text-sm font-semibold text-white hover:bg-blue-600"><UserRoundPlus className="h-4 w-4" />Register Student</button></div>
    </header>
    <div className="erp-card erp-card--nimvelo overflow-hidden rounded-2xl border border-white/20 shadow-lg">
      <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-sm text-white"><thead className="bg-[#1D293D] text-xs uppercase tracking-wide text-white"><tr>
        <th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">WhatsApp</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Nationality</th>
        <th className="px-4 py-3">Certification agency</th><th className="px-4 py-3">Certification level</th><th className="px-4 py-3 text-right">Depth PB</th><th className="px-4 py-3">Static apnea PB</th>
      </tr></thead><tbody className="divide-y divide-white/20">{contacts.map((student) => <tr key={student.id} className="text-white transition-colors hover:bg-white/10">
        <td className="whitespace-nowrap px-4 py-3 font-semibold">{student.first_name} {student.last_name}</td><td className="px-4 py-3">{student.email}</td><td className="px-4 py-3">{student.whatsapp || '—'}</td><td className="px-4 py-3 capitalize">{student.status?.replace('_', ' ') || '—'}</td><td className="px-4 py-3">{student.nationality || '—'}</td>
        <td className="px-4 py-3">{student.certification_agency || '—'}</td><td className="px-4 py-3">{student.certification_level || '—'}</td><td className="px-4 py-3 text-right tabular-nums">{Number.isFinite(student.total_depth_pb) && student.total_depth_pb > 0 ? `${student.total_depth_pb} m` : '—'}</td><td className="px-4 py-3 tabular-nums">{student.static_apnea_pb || '—'}</td>
      </tr>)}{contacts.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-white/80">{students.length ? 'No contacts match this search.' : 'No registered students yet.'}</td></tr>}</tbody></table></div>
    </div>
  </section>;
}
