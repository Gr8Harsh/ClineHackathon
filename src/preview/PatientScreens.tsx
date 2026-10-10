import { useState } from 'react';
import { ArrowUpRight, Bell, CalendarDays, ChevronRight, Search, SlidersHorizontal, Sprout, Video } from 'lucide-react';
import { Button } from '../components/ui/button.tsx';
import { doctors } from './fixtures.ts';

export type PreviewDoctor = typeof doctors[number];

// Local illustrations, not photographs or representations of real clinicians.
export function Avatar({ index = 0, patient = false }: { index?: number; patient?: boolean }) {
  const skin = ['#c88f6d', '#9c6246', '#e5b497', '#b47f5c'][index % 4];
  return <svg className={`portrait ${patient ? 'patient-portrait' : ''}`} viewBox="0 0 64 64" role="img" aria-label={patient ? 'Illustrated demo patient' : 'Illustrated fictional doctor'}>
    <circle cx="32" cy="32" r="32" fill={['#d9dfd3', '#e0e4e5', '#e5ddd6', '#d8dfd4'][index % 4]} />
    <path d="M14 32c-1-22 35-28 37 0l-2 23H13Z" fill={index % 2 ? '#353630' : '#514033'} />
    <path d="M6 64c1-18 12-23 26-23s25 5 26 23" fill={patient ? '#77806c' : '#fafbf8'} />
    <path d="m24 43 8 18 8-18-8 6Z" fill="#8caaa7" />
    <path d="M27 35h10v13c-4 5-7 5-10 0Z" fill={skin} />
    <ellipse cx="32" cy="28" rx="12" ry="16" fill={skin} />
    <path d="M19 27c-2-17 26-20 26-1-7-1-12-7-14-11-1 7-7 11-12 12" fill={index % 2 ? '#353630' : '#514033'} />
    <path d="M27 29h1m8 0h1m-8 8q3 2 6 0" fill="none" stroke="#533d32" strokeWidth="1.5" strokeLinecap="round" />
    {!patient && <path d="M21 46v8q0 8 8 8m14-16v8q0 5-5 6" fill="none" stroke="#67766e" strokeWidth="2" />}
  </svg>;
}

export function PatientHome({ onChat, onCare, onNotes, onProfile, onNotifications, onDoctor }: {
  onChat: () => void; onCare: () => void; onNotes: () => void; onProfile: () => void; onNotifications: () => void; onDoctor: (doctor: PreviewDoctor) => void;
}) {
  const [specialty, setSpecialty] = useState('All Specialties');
  const visible = doctors.filter(d => specialty === 'All Specialties' || d.specialty === specialty);
  return <div className="home-screen">
    <div className="home-greeting"><button className="avatar-button" aria-label="Open profile menu" onClick={onProfile}><Avatar patient /></button><div><p>Good Morning,</p><strong>Rose Williams</strong></div><button className="notification-button" aria-label="Notifications" onClick={onNotifications}><Bell size={19} /><i /></button></div>
    <h1>How are you feeling<br />today? <span aria-hidden="true">☀️</span></h1>
    <button className="wellness-banner" onClick={onNotes}><span className="wellness-tile"><small>Your health notes</small><strong>Let’s begin</strong><Sprout aria-hidden="true" /></span><span className="wellness-copy"><strong>Ready for your visit?</strong><span>Keep your words and reports together for your next consultation.</span><small>More details <ChevronRight size={12} /></small></span></button>
    <div className="consultation-cards"><section><h2>Online Doctor<br />Consultation</h2><p>Talk through your concerns and prepare your consultation notes.</p><Button onClick={onChat}>Find doctor</Button></section><section><h2>Visit a Doctor<br />Offline</h2><p>Explore fictional doctor profiles in this appointment preview.</p><Button onClick={onCare}>Appointment</Button></section></div>
    <div className="specialty-tabs" aria-label="Doctor specialties">{['All Specialties', 'Oncology', 'Radiology', 'General medicine'].map(s => <button key={s} aria-pressed={specialty === s} onClick={() => setSpecialty(s)}>{s === 'Oncology' ? 'Oncologists' : s === 'Radiology' ? 'Radiologists' : s}</button>)}</div>
    <div className="section-heading"><h2>Specialized Doctors</h2><button onClick={onCare}>See all</button></div>
    <div className="home-doctors">{visible.map(d => <div className="home-doctor" key={d.id}><Avatar index={doctors.indexOf(d)} /><div><strong>{d.name}</strong><span>{d.specialty}</span></div><button onClick={() => onDoctor(d)}>View Profile</button></div>)}</div>
  </div>;
}

export function DoctorDirectory({ noSlots, onDoctor, onReset }: { noSlots: boolean; onDoctor: (doctor: PreviewDoctor) => void; onReset: () => void }) {
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [specialty, setSpecialty] = useState('All Specialties');
  const visible = doctors.filter(d => (specialty === 'All Specialties' || d.specialty === specialty) && `${d.name} ${d.specialty} ${d.location}`.toLowerCase().includes(search.toLowerCase().trim()));
  return <div className="directory-screen">
    <div className="doctor-search"><label><Search size={18} /><input aria-label="Search doctors" placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} /></label><button aria-label="Filter doctors" aria-expanded={filterOpen} onClick={() => setFilterOpen(v => !v)}><SlidersHorizontal size={18} /></button></div>
    {filterOpen && <label className="directory-filter">Specialty<select aria-label="Filter by specialty" value={specialty} onChange={e => setSpecialty(e.target.value)}>{['All Specialties', ...new Set(doctors.map(d => d.specialty))].map(s => <option key={s}>{s}</option>)}</select></label>}
    <h2>Recommended Doctors</h2>
    <p className="directory-disclaimer">Fictional directory · not a clinical recommendation</p>
    {noSlots ? <div className="directory-empty"><CalendarDays /><h3>No appointments in this fixture</h3><p>Nothing has been booked. Contact a clinic directly or try again later.</p><Button variant="outline" onClick={onReset}>Reset to routine fixture</Button></div> : <div className="directory-list">{visible.map(d => <button className="directory-doctor" key={d.id} onClick={() => onDoctor(d)}><Avatar index={doctors.indexOf(d)} /><span className="directory-doctor-name"><strong>{d.name}</strong><span>{d.specialty}</span></span><span className="availability"><i />Available<span className="sr-only"> in synthetic fixture</span></span></button>)}{!visible.length && <p className="directory-empty" role="status">No matching doctors. Try another name or specialty.</p>}</div>}
    <p className="directory-disclaimer directory-bottom">Example availability only. No live slot is held.</p>
  </div>;
}

export function AppointmentCard({ doctor, time, onBook }: { doctor: PreviewDoctor; time: string; onBook: () => void }) {
  return <div className="embedded-appointment"><p className="booking-card-label"><CalendarDays size={15} />Doctor Booking</p><div className="booking-card-content"><div className="booking-card-doctor"><Avatar index={doctors.indexOf(doctor)} /><div><strong>{doctor.name}</strong><span>{doctor.specialty}</span><small>Fictional profile · ₹{doctor.fee}</small></div></div><p><CalendarDays size={14} />Tomorrow · example date</p><p><Video size={14} />{time} IST · Video</p><Button onClick={onBook}>Book Appointment <ArrowUpRight size={14} /></Button><small>Preview only · review before confirming</small></div></div>;
}