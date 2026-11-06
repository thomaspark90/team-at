'use client';

import { useEffect, useRef, useState } from 'react';

// 앱 안 카메라 — 화면에 실시간 영상을 띄워 그 자리에서 찍은 장면만 사진이 된다.
// 파일 선택 입력을 두지 않아 갤러리의 이전 사진을 고르는 경로가 없다.

const MAX_EDGE = 1280; // 업로드 한도(4MB) 안에 들도록 긴 변을 줄인다

const cameraError = (e: unknown): string => {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return '카메라 권한이 꺼져 있습니다. 브라우저 설정에서 이 사이트의 카메라를 허용해 주세요.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '사용할 수 있는 카메라를 찾지 못했습니다.';
  return '카메라를 열지 못했습니다. 다른 앱이 쓰고 있으면 닫고 다시 시도해 주세요.';
};

export default function CameraCapture({
  title,
  onClose,
  onUse,
}: {
  title: string;
  onClose: () => void;
  onUse: (photo: Blob) => Promise<string | null>; // 실패 문구 또는 null
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('이 브라우저에서는 카메라를 쓸 수 없습니다. 카카오톡 등 앱 안 브라우저라면 Safari나 Chrome에서 열어 주세요.');
      return;
    }
    let stopped = false;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((e) => setError(cameraError(e)));
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url);
  }, [shot]);

  const take = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) setShot({ blob, url: URL.createObjectURL(blob) });
        else setError('사진을 만들지 못했습니다. 다시 찍어 주세요.');
      },
      'image/jpeg',
      0.8,
    );
  };

  const use = async () => {
    if (!shot) return;
    setSaving(true);
    const failed = await onUse(shot.blob);
    setSaving(false);
    if (failed) setError(failed);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-modal="true" aria-label={`${title} 사진 찍기`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate text-body">{title}</p>
        <button type="button" className="ta-btn shrink-0" onClick={onClose} disabled={saving}>
          닫기
        </button>
      </div>
      <div className="relative min-h-0 flex-1 bg-foreground">
        {/* 촬영 전 영상은 계속 재생해 두고, 찍은 뒤엔 그 위에 결과만 덮는다 */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setReady(true)}
          className="h-full w-full object-contain"
        />
        {shot && (
          // eslint-disable-next-line @next/next/no-img-element -- 업로드 전 로컬 미리보기(blob: URL)
          <img src={shot.url} alt="찍은 사진" className="absolute inset-0 h-full w-full bg-foreground object-contain" />
        )}
      </div>
      <div className="space-y-3 px-4 py-4">
        {error && <p className="ta-error text-body">{error}</p>}
        {!shot && !error && <p className="text-caption text-muted-foreground">사람이 나오지 않게 찍어 주세요.</p>}
        {shot ? (
          <div className="flex gap-3">
            <button type="button" className="ta-btn h-12 flex-1" onClick={() => { setShot(null); setError(null); }} disabled={saving}>
              다시 찍기
            </button>
            <button type="button" className="ta-btn-primary h-12 flex-1" onClick={use} disabled={saving}>
              {saving ? '올리는 중' : '이 사진 사용'}
            </button>
          </div>
        ) : (
          <button type="button" className="ta-btn-primary h-12 w-full" onClick={take} disabled={!ready}>
            찍기
          </button>
        )}
      </div>
    </div>
  );
}
