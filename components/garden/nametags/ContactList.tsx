import { contactName, type NametagContact } from '@/lib/garden/nametags';

// 담당자 이름·연락처 한 줄 — "받는 사람: 홍길동 010-1234-5678". 전화번호는 누르면 바로 걸린다.
export default function ContactList({ label, contacts, className = '' }: { label: string; contacts: NametagContact[]; className?: string }) {
  return (
    <p className={`m-0 flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted-foreground ${className}`}>
      <span>{label}</span>
      {contacts.map((c) => (
        <span key={c.email} className="text-foreground">
          {contactName(c)}
          {c.phone && (
            <a href={`tel:${c.phone.replace(/[^0-9+]/g, '')}`} className="ml-1 underline">
              {c.phone}
            </a>
          )}
        </span>
      ))}
    </p>
  );
}
