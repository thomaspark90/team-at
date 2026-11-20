import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/app-url';
import { logActivity } from '@/lib/finance/activity';
import {
  DELIVERY_OPTIONS,
  MAX_LINES,
  MAX_QTY,
  contactName,
  deliveryText,
  oneLine,
  sheetCount,
  tagTotal,
  type NametagDelivery,
  type NametagLine,
  type NametagRequest,
} from '@/lib/garden/nametags';
import {
  badRequest,
  nametagRequests,
  printRecipients,
  readCatalog,
  readContacts,
  requireNametagActor,
  toContact,
} from '@/lib/garden/nametags-server';
import { notifyGardenEvent } from '@/lib/notify';

export const runtime = 'nodejs';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nameOf = (email: string) => email.split('@')[0];

// 프린트 요청 — { lines: [{ itemId, qty }], note? } → 저장 후 nametagPrint 담당자에게 이메일+웹푸시.
// 문구는 서버가 카탈로그에서 다시 읽어 담는다(클라이언트가 보낸 문구를 인쇄물에 싣지 않는다).
export async function POST(req: Request) {
  const a = await requireNametagActor();
  if (a instanceof NextResponse) return a;
  const b = (await req.json().catch(() => ({}))) as { lines?: unknown; note?: unknown };
  if (!Array.isArray(b.lines) || b.lines.length === 0) return badRequest('프린트할 메뉴를 골라주세요.');
  if (b.lines.length > MAX_LINES) return badRequest(`한 번에 ${MAX_LINES}종까지 요청할 수 있어요.`);

  const catalog = await readCatalog();
  const byId = new Map(catalog.items.map((i) => [i.id, i]));
  const lines: NametagLine[] = [];
  for (const raw of b.lines as { itemId?: unknown; qty?: unknown }[]) {
    const item = byId.get(String(raw?.itemId ?? ''));
    if (!item) return badRequest('목록에서 사라진 메뉴가 있어요. 새로고침 후 다시 골라주세요.');
    const qty = Number.isInteger(raw.qty) ? Math.min(MAX_QTY, Math.max(1, raw.qty as number)) : 1;
    lines.push({ itemId: item.id, kind: item.kind, ko: item.ko, en: item.en, desc: item.desc, qty });
  }
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 300) : undefined;
  const sentTo = await printRecipients(a.supabase);
  const request: NametagRequest = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    by: a.user.email ?? '',
    note,
    lines,
    status: 'requested',
    sentTo, // 보낸 시점의 담당자 이름·연락처 — 이후 담당자가 바뀌어도 이 요청은 누구에게 갔는지 남는다
  };
  await nametagRequests.writeOne(request);

  const total = tagTotal(lines);
  const summary = `${lines.length}종 ${total}장 · A4 ${sheetCount(total)}장`;
  const by = nameOf(request.by);
  const emails = sentTo.map((c) => c.email);
  await notifyGardenEvent(a.supabase, {
    emails,
    subject: `[네임택 프린트 요청] ${summary}`,
    html: `
    <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
      <p><strong>브런치 네임택 프린트 요청</strong> — ${summary}</p>
      <ul>${lines.map((l) => `<li>${esc(oneLine(l.ko))}${l.qty > 1 ? ` × ${l.qty}` : ''}</li>`).join('')}</ul>
      ${note ? `<p>메모: ${esc(note)}</p>` : ''}
      ${by ? `<p>요청: ${esc(by)}</p>` : ''}
      <p><a href="${APP_URL}/garden/nametags/manage">인쇄 파일 받기 →</a></p>
    </div>`,
    push: {
      title: `네임택 프린트 요청 · ${summary}`,
      body: `${lines.slice(0, 3).map((l) => oneLine(l.ko)).join(', ')}${lines.length > 3 ? ` 외 ${lines.length - 3}종` : ''}${by ? ` — ${by} 요청` : ''}`,
      url: '/garden/nametags/manage',
    },
  });
  await logActivity(a.supabase, a.user, '가든서비스 네임택 프린트 요청', summary);
  return NextResponse.json({ ok: true, request, sentTo });
}

// 인쇄 완료 표시 — { id, done, delivery?, deliveryNote? } (관리 탭). 완료로 바꿀 때만 요청자에게 알린다.
// delivery: 'direct'(인쇄한 사람이 직접 전달) | 'other'(다른 분이 전달 — 누구인지는 메모). 알림에 인쇄한 사람 이름·연락처를 함께 싣는다.
export async function PATCH(req: Request) {
  const a = await requireNametagActor(true);
  if (a instanceof NextResponse) return a;
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; done?: unknown; delivery?: unknown; deliveryNote?: unknown };
  const cur = await nametagRequests.readOne(String(b.id ?? ''));
  if (!cur) return badRequest('요청을 찾지 못했습니다.');
  const done = b.done === true;
  const delivery = DELIVERY_OPTIONS.find((o) => o.id === b.delivery)?.id as NametagDelivery | undefined;
  if (done && !delivery) return badRequest('인쇄물을 어떻게 전달할지 골라주세요.');
  const deliveryNote = typeof b.deliveryNote === 'string' && b.deliveryNote.trim() ? b.deliveryNote.trim().slice(0, 200) : undefined;
  const me = a.user.email ?? '';
  const next: NametagRequest = done
    ? { ...cur, status: 'done', doneAt: new Date().toISOString(), doneBy: me, delivery, deliveryNote, doneByContact: toContact(await readContacts(), me) }
    : { ...cur, status: 'requested', doneAt: undefined, doneBy: undefined, delivery: undefined, deliveryNote: undefined, doneByContact: undefined };
  await nametagRequests.writeOne(next);

  if (done && cur.status !== 'done' && cur.by && cur.by !== a.user.email) {
    const total = tagTotal(cur.lines);
    const how = deliveryText(next);
    const c = next.doneByContact;
    const contact = c ? `${contactName(c)}${c.phone ? ` ${c.phone}` : ''}` : '';
    await notifyGardenEvent(a.supabase, {
      emails: [cur.by],
      subject: `[네임택 프린트 완료] ${cur.lines.length}종 ${total}장`,
      html: `
      <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
        <p><strong>요청하신 네임택을 인쇄했어요</strong> — ${cur.lines.length}종 ${total}장</p>
        <p>수령: ${esc(how)}</p>
        ${contact ? `<p>인쇄 담당: ${esc(contact)}</p>` : ''}
        <p><a href="${APP_URL}/garden/nametags">네임택 열기 →</a></p>
      </div>`,
      push: { title: '네임택 프린트 완료', body: `${cur.lines.length}종 ${total}장 · ${how}`, url: '/garden/nametags' },
    });
  }
  if (done) await logActivity(a.supabase, a.user, '가든서비스 네임택 프린트 완료', `${cur.lines.length}종 · ${nameOf(cur.by)} 요청분`);
  return NextResponse.json({ ok: true, request: next });
}

// 요청 삭제·취소 — ?id= (2026-11-20). 인쇄·메뉴 관리 권한이면 어떤 요청이든 지우고(시험 요청·중복 정리),
// 스탭은 아직 인쇄 대기 중인 자기 요청만 취소할 수 있다. 대기 중이던 요청이 사라지면 상대편에게 알린다:
// 스탭이 취소 → 알림 받았던 인쇄 담당에게 / 담당이 삭제 → 요청자에게. 완료된 요청은 기록 정리일 뿐이라 알리지 않는다.
export async function DELETE(req: Request) {
  const a = await requireNametagActor();
  if (a instanceof NextResponse) return a;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const cur = await nametagRequests.readOne(id);
  if (!cur) return badRequest('요청을 찾지 못했습니다. 이미 지워졌을 수 있어요.');
  const me = (a.user.email ?? '').toLowerCase();
  const mine = !!me && (cur.by ?? '').toLowerCase() === me;
  if (!a.canManage) {
    if (!mine) return NextResponse.json({ error: '내가 보낸 요청만 취소할 수 있습니다.' }, { status: 403 });
    if (cur.status === 'done') return badRequest('이미 인쇄가 끝난 요청은 취소할 수 없습니다.');
  }
  await nametagRequests.deleteOne(id);

  const summary = `${cur.lines.length}종 ${tagTotal(cur.lines)}장`;
  if (cur.status !== 'done') {
    const emails = (mine ? (cur.sentTo ?? []).map((c) => c.email) : cur.by ? [cur.by] : []).filter((e) => e && e.toLowerCase() !== me);
    if (emails.length > 0) {
      const who = nameOf(a.user.email ?? '');
      const names = cur.lines.slice(0, 3).map((l) => oneLine(l.ko)).join(', ') + (cur.lines.length > 3 ? ` 외 ${cur.lines.length - 3}종` : '');
      await notifyGardenEvent(a.supabase, {
        emails,
        subject: `[네임택 프린트 요청 취소] ${summary}`,
        html: `
        <div style="font-family:sans-serif;font-size:14px;line-height:1.7">
          <p><strong>네임택 프린트 요청이 취소됐어요</strong> — ${summary}</p>
          <p>${esc(names)}</p>
          <p>${mine ? `${esc(who)}님이 요청을 취소했습니다. 인쇄하지 않아도 됩니다.` : `${esc(who)}님이 요청을 지웠습니다. 필요하면 다시 요청해 주세요.`}</p>
        </div>`,
        push: {
          title: `네임택 프린트 요청 취소 · ${summary}`,
          body: mine ? `${who}님이 취소 — 인쇄하지 않아도 됩니다` : `${who}님이 요청을 지웠어요 — 필요하면 다시 요청해 주세요`,
          url: mine ? '/garden/nametags/manage' : '/garden/nametags',
        },
      });
    }
  }
  await logActivity(a.supabase, a.user, mine && cur.status !== 'done' ? '가든서비스 네임택 프린트 요청 취소' : '가든서비스 네임택 프린트 요청 삭제', `${summary} · ${nameOf(cur.by)} 요청분`);
  return NextResponse.json({ ok: true });
}
