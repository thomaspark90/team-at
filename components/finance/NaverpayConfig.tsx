'use client';

import { useEffect, useState } from 'react';

// 네이버페이 자동 수집 설정 — 크롤링 주소 확인·변경 ('자료 입력' 페이지).
// 수집기(로컬 Mac, 매일 19:00)는 실행 시작 때 이 값을 읽어가므로 다음 수집부터 적용된다.
export default function NaverpayConfig() {
  const [url, setUrl] = useState('');
  const [defaultUrl, setDefaultUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/finance/naverpay/config');
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || '설정을 불러오지 못했어요.');
        setUrl(j.historyUrl);
        setSavedUrl(j.historyUrl);
        setDefaultUrl(j.defaultUrl);
        setUpdatedAt(j.updatedAt);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  async function save(next?: string) {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch('/api/finance/naverpay/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ historyUrl: next ?? url }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '저장에 실패했어요.');
      setUrl(j.historyUrl);
      setSavedUrl(j.historyUrl);
      setUpdatedAt(j.updatedAt);
      setNotice('저장했어요. 다음 자동 수집(매일 19:00)부터 이 주소를 크롤링해요.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const dirty = url.trim() !== savedUrl;

  return (
    <section>
      <h2 className="m-0 text-[15px] font-medium">네이버페이 자동 수집 주소</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        매일 19:00 Mac 수집기가 이 주소의 결제내역을 크롤링해요. 네이버가 페이지 주소를 바꾸면
        여기서 수정하세요. 어떤 계정의 내역이 수집되는지는 주소가 아니라 <b>Mac의 네이버 로그인
        세션</b>이 정해요 (계정 교체는 Mac에서 쿠키갱신.command).
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
          placeholder={defaultUrl || 'https://pay.naver.com/pc/history?page=1'}
          className="min-w-[260px] flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 font-mono text-[13px]"
        />
        <button
          onClick={() => save()}
          disabled={saving || !dirty}
          className="rounded-xl bg-foreground px-4 py-2.5 text-[13px] font-medium text-background disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        {defaultUrl && savedUrl !== defaultUrl && (
          <button
            onClick={() => save(defaultUrl)}
            disabled={saving}
            className="rounded-xl border border-border px-3 py-2.5 text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            기본값 복원
          </button>
        )}
      </div>
      {updatedAt && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          마지막 변경 {new Date(updatedAt).toLocaleString('ko-KR')}
        </p>
      )}
      {notice && <p className="mt-2 text-[13px]" style={{ color: 'hsl(var(--number-colored))' }}>{notice}</p>}
      {error && <p className="mt-2 text-[13px] text-red-500">{error}</p>}
    </section>
  );
}
