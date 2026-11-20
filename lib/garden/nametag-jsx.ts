import { TAGS_PER_SHEET, type NametagTag } from './nametags';

// 네임택 인쇄용 일러스트 스크립트(.jsx) 생성 — 받은 파일을 일러스트에서 실행하면
// 새 A4(CMYK) 문서에 요청된 택이 2×5칸으로 채워진다.
//
// 수치는 원본 '브런치네임택_양재_261119.ai'를 일러스트로 열어 읽은 값이다(2026-11-20).
//   · 칸 255.118×141.732pt(90×50mm), 재단 십자선 14.173pt·0.2pt·K100
//   · 한글명 FreesentationVF 3Light 18pt / 영문 Elza Narrow Light 10pt·자간 10 / 설명 2ExtraLight 11pt·행간 13.2
//   · 안내 택 5Medium 18pt + 영문 12pt, 큰 안내 5Medium 24pt·행간 32 (가운데)
// 같은 문구를 넣어 원본과 글자 폭이 소수점 셋째 자리까지 같음을 확인했다. 서체·크기를 바꾸려면 원본부터 다시 잴 것.
// Elza Narrow 는 Adobe Fonts 라 웹에서 PDF 로 구울 수 없다 — 그래서 조판을 일러스트에 맡긴다.
//
// ⚠️ 아래 템플릿 안에는 역슬래시·백틱·달러중괄호를 쓰지 않는다(TS 템플릿 리터럴이 해석한다).
//    한글은 그대로 적고, 내보낼 때 toAscii 가 전부 유니코드 이스케이프로 바꾼다(일러스트의 파일 인코딩 오판 방지).
const TEMPLATE = `// Garden Service brunch name tags (team-at). Illustrator: File > Scripts > Other Script...
(function () {
  var TAGS = /*__DATA__*/[];
  var FONTS = { ko: 'FreesentationVF-3Light', koBold: 'FreesentationVF-5Medium', desc: 'FreesentationVF-2ExtraLight', en: 'Elza-NarrowLight' };
  var CR = String.fromCharCode(13), LF = String.fromCharCode(10);
  function getFont(name) { try { return app.textFonts.getByName(name); } catch (e) { return null; } }
  var F = {}, missing = [];
  for (var key in FONTS) { F[key] = getFont(FONTS[key]); if (!F[key]) missing.push(FONTS[key]); }
  if (missing.length) {
    alert('서체가 없어 중단했어요.' + LF + LF + missing.join(LF) + LF + LF + 'Freesentation VF 설치, Elza Narrow(Adobe Fonts) 활성화 뒤 다시 실행해 주세요.');
    return 'missing:' + missing.join(',');
  }
  if (!TAGS.length) { alert('인쇄할 택이 없어요.'); return 'empty'; }

  var W = 595.276, H = 841.89, TW = 255.118, TH = 141.732, COLS = 2, ROWS = 5, PER = /*__PER__*/10;
  var MX = (W - COLS * TW) / 2, MY = (H - ROWS * TH) / 2, MARK = 14.173;
  var pages = Math.ceil(TAGS.length / PER);
  var doc = app.documents.add(DocumentColorSpace.CMYK, W, H, pages, DocumentArtboardLayout.GridByRow, 40, 5);
  var K = new CMYKColor(); K.cyan = 0; K.magenta = 0; K.yellow = 0; K.black = 100;
  var over = [];

  function line(x1, y1, x2, y2) {
    var p = doc.pathItems.add(); p.setEntirePath([[x1, y1], [x2, y2]]);
    p.filled = false; p.stroked = true; p.strokeWidth = 0.2; p.strokeColor = K;
  }
  function text(x, y, str, font, size, leading, tracking, center) {
    var t = doc.textFrames.pointText([x, y]);
    t.contents = String(str).split(LF).join(CR);
    var ca = t.textRange.characterAttributes;
    ca.textFont = font; ca.size = size; ca.autoLeading = false; ca.leading = leading; ca.tracking = tracking; ca.fillColor = K; ca.stroked = false;
    if (center) t.textRange.paragraphAttributes.justification = Justification.CENTER;
    return t;
  }
  for (var pg = 0; pg < pages; pg++) {
    var r = doc.artboards[pg].artboardRect, L = r[0], T = r[1];
    for (var cy = 0; cy <= ROWS; cy++) for (var cx = 0; cx <= COLS; cx++) {
      var mx = L + MX + cx * TW, my = T - MY - cy * TH;
      line(mx - MARK / 2, my, mx + MARK / 2, my); line(mx, my + MARK / 2, mx, my - MARK / 2);
    }
    for (var s = 0; s < PER; s++) {
      var tag = TAGS[pg * PER + s]; if (!tag) break;
      var ox = L + MX + (s % COLS) * TW, oy = T - MY - Math.floor(s / COLS) * TH, mid = ox + TW / 2, frames = [];
      if (tag.k == 'big') {
        var n = String(tag.ko).split(LF).length;
        frames.push(text(mid, oy - (62.64 + (2 - n) * 16), tag.ko, F.koBold, 24, 32, 0, true));
      } else if (tag.k == 'notice') {
        frames.push(text(mid, oy - 69.1, tag.ko, F.koBold, 18, 32, 0, true));
        if (tag.en) frames.push(text(mid, oy - 85.1, tag.en, F.en, 12, 14.4, 0, true));
      } else {
        frames.push(text(ox + 25.31, oy - 36.3, tag.ko, F.ko, 18, 32, 0, false));
        if (tag.en) frames.push(text(ox + 26.11, oy - 50.4, tag.en, F.en, 10, 26.871, 10, false));
        if (tag.desc) frames.push(text(ox + 25.30, oy - 73.9, tag.desc, F.desc, 11, 13.2, 0, false));
      }
      for (var i = 0; i < frames.length; i++) {
        var g = frames[i].geometricBounds;
        if (g[0] < ox + 8 || g[2] > ox + TW - 8 || g[3] < oy - TH + 8) { over.push(String(tag.ko).split(LF).join(' ')); break; }
      }
    }
  }
  doc.selection = null;
  if (over.length) alert('칸을 넘치거나 재단선에 가까운 택이 있어요. 인쇄 전에 확인해 주세요.' + LF + LF + over.join(LF));
  return 'ok:' + TAGS.length + ':' + pages;
})();
`;

/** 비 ASCII 문자를 유니코드 이스케이프로 — 결과 파일은 순수 ASCII 가 된다. */
const toAscii = (s: string) => s.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

export function buildNametagJsx(tags: NametagTag[]): string {
  const data = JSON.stringify(tags.map((t) => ({ k: t.k, ko: t.ko, en: t.en, desc: t.desc })));
  // 함수형 치환 — 문구에 '$&' 같은 치환 패턴이 들어 있어도 그대로 들어가게
  return toAscii(TEMPLATE.replace('/*__DATA__*/[]', () => data).replace('/*__PER__*/10', () => String(TAGS_PER_SHEET)));
}
