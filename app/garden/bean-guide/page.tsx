'use client';

import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import BeanCite from '@/components/garden/bean-guide/BeanCite';
import { AltitudeChain, AltitudeFindings, AltitudeMeasures, FactorTable, LatitudeTable, MythTable, ReviewCounts } from '@/components/garden/bean-guide/FactorTables';
import FarmList from '@/components/garden/bean-guide/FarmTables';
import Glossary from '@/components/garden/bean-guide/Glossary';
import { FoldedSection } from '@/components/garden/bean-guide/MoreDetails';
import { MenuNameTable, NameAnatomy, NameTerms, ReadingSteps } from '@/components/garden/bean-guide/NameGuide';
import OriginTables from '@/components/garden/bean-guide/OriginTables';
import { HoneyTable, ProcessRules, ProcessTables } from '@/components/garden/bean-guide/ProcessGuide';
import SectionNav from '@/components/garden/bean-guide/SectionNav';
import { GLOSSARY_ID } from '@/lib/garden/bean-guide/sections';
import { BEAN_SOURCES } from '@/lib/garden/bean-guide/sources';

// 원두에 대한 이해 — 스탭 교육·현장 참고용. 데이터는 lib/garden/bean-guide.
const Heading = ({ children }: { children: React.ReactNode }) => <h2 className="m-0 mb-3 text-title">{children}</h2>;
const Sub = ({ children }: { children: React.ReactNode }) => <h3 className="m-0 mb-2 text-body font-medium">{children}</h3>;
const Lead = ({ children }: { children: React.ReactNode }) => (
  <p className="ta-prose m-0 mb-4 text-body text-muted-foreground">{children}</p>
);
const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="ta-prose mb-0 mt-2 text-caption text-muted-foreground">{children}</p>
);

export default function GardenBeanGuidePage() {
  return (
    <PageShell nav={<GardenNav />}>
      <header className="mb-16 pt-6 sm:mb-24 sm:pt-14">
        <h1 className="m-0 text-display">원두에 대한 이해</h1>
        <div className="ta-prose mt-3 text-body text-muted-foreground">산지, 농장, 이름, 가공, 재배 조건으로 원두를 읽는 법을 정리했습니다.</div>
      </header>
      <SectionNav />
      <div className="space-y-16 pb-10 sm:space-y-24 sm:pb-20">
        <section id="bean-origin" className="scroll-mt-28">
          <Heading>원산지별 떼루아</Heading>
          <Lead>국가를 누르면 지역별 내용이 펼쳐집니다. 풍미는 측정값이 아니라 자주 묘사되는 표현이고, ‘—’는 신뢰할 값을 찾지 못한 칸입니다.</Lead>
          <OriginTables />
          <Note>국가 요약은 조사한 지역 값을 묶은 대략적인 범위입니다. 근거 A는 법령·공공 기관·논문, B는 수입사·로스터·업계지, C는 출처 미표기 자료 또는 검색 요약입니다.</Note>
        </section>

        <section id="bean-farm" className="scroll-mt-28">
          <Heading>유명 농장</Heading>
          <Lead>대회 성적과 가격은 해당 연도의 한 랏 기록이며, 농장의 순위가 아닙니다. ‘—’는 확인하지 못한 값입니다.</Lead>
          <FarmList />
        </section>

        <section id="bean-name" className="scroll-mt-28">
          <Heading>커피 이름 읽는 법</Heading>
          <Lead>이름의 순서는 법으로 정해진 형식이 아니라 로스터의 관행입니다.</Lead>
          <NameAnatomy />
          <div className="mt-8">
            <ReadingSteps />
          </div>
          <div className="mt-10">
            <Sub>우리가 다룬 필터 원두</Sub>
            <MenuNameTable />
            <Note>괄호 값은 이름에 없고 로스터 자료에서 확인한 내용입니다. 일부는 자이언트 유사 상품과 대조한 결과이므로 봉투와 거래 명세서가 우선합니다.</Note>
          </div>
          <div className="mt-10">
            <Sub>이름에 자주 나오는 단어</Sub>
            <NameTerms />
          </div>
        </section>

        <section id="bean-process" className="scroll-mt-28">
          <Heading>가공 방식</Heading>
          <Lead>이름이 같아도 시간과 온도는 생산자마다 다릅니다. 표의 숫자는 표준이 아니라 사례로 읽어주세요.</Lead>
          <ProcessTables />
          <div className="mt-10">
            <Sub>
              Honey의 색 구분
              <BeanCite ids={['pdg-honey']} />
            </Sub>
            <div className="ta-prose">
              <HoneyTable />
            </div>
            <Note>대표값입니다. 같은 Red라도 생산자에 따라 다른 커피의 Yellow나 Black에 해당할 수 있습니다.</Note>
          </div>
          <div className="mt-10">
            <Sub>Infused를 둘러싼 기준</Sub>
            <ProcessRules />
          </div>
        </section>

        <section id="bean-altitude" className="scroll-mt-28">
          <Heading>고도와 기타 요소</Heading>
          <Lead>고도 자체보다 서늘한 기온이 핵심으로 보입니다. 아래 흐름은 경향이며, 전체 과정을 한 연구에서 인과로 증명한 사례는 찾지 못했습니다.</Lead>
          <AltitudeChain />
          <div className="mt-6">
            <AltitudeFindings />
          </div>
          <div className="mt-10">
            <Sub>고도가 오르면 무엇이 달라지나</Sub>
            <AltitudeMeasures />
            <Note>지역을 비교한 연구가 많아 품종, 가공, 농장 관리 차이가 함께 섞일 수 있습니다.</Note>
          </div>
          <div className="mt-10">
            <Sub>그 밖의 요소</Sub>
            <FactorTable />
          </div>
          <div className="mt-10">
            <Sub>자주 듣는 말 점검</Sub>
            <MythTable />
          </div>
          <FoldedSection title="요인별 연구 방향" className="mt-10">
            <div className="ta-prose">
              <ReviewCounts />
            </div>
            <Note>
              문헌고찰 73편 중 요인별로 센 값입니다. 관능 방향을 밝힌 연구만 셌고 효과 크기나 요인 순위는 아닙니다. 물 스트레스는 양방향을 보고한 1편이 더 있습니다.
              <BeanCite ids={['ahmed']} />
            </Note>
          </FoldedSection>
          <FoldedSection title="위도에 따라 달라지는 고도 기준" className="mt-4">
            <div className="ta-prose">
              <LatitudeTable />
            </div>
            <Note>
              재배 적합 기준입니다. 같은 ‘높음’이라도 기온이 같다는 측정값은 아닙니다.
              <BeanCite ids={['wcr-bourbon']} />
            </Note>
          </FoldedSection>
        </section>

        <FoldedSection id={GLOSSARY_ID} title="용어 풀이" className="scroll-mt-28" titleClassName="text-title">
          <Glossary />
          <Note>일반적인 뜻을 짧게 풀어 쓴 설명이며 별도 출처를 달지 않았습니다. 수치 근거는 각 표의 출처를 따릅니다.</Note>
        </FoldedSection>

        <details id="bean-sources" className="group">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <h2 className="m-0 text-title">출처</h2>
            <span className="text-caption text-muted-foreground">{BEAN_SOURCES.length}건</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-180">
              <path d="M2.5 4.5 6 8l3.5-3.5" />
            </svg>
          </summary>
          <ol className="m-0 mt-3 grid list-none gap-x-8 gap-y-1.5 p-0 lg:grid-cols-2">
            {BEAN_SOURCES.map((s, i) => (
              <li key={s.id} id={`bean-src-${i + 1}`} className="grid scroll-mt-24 grid-cols-[2rem_1fr] text-caption">
                <span className="tabular text-muted-foreground">[{i + 1}]</span>
                <span className="min-w-0 break-words">
                  <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-2 hover:decoration-foreground">
                    {s.cite}
                  </a>
                  <span className="text-muted-foreground"> · {s.grade}</span>
                </span>
              </li>
            ))}
          </ol>
          <Note>조사일 2026-11-06. 자이언트 상세는 이미지를 OCR로 읽은 값이라 오탈자가 있을 수 있습니다.</Note>
        </details>
      </div>
    </PageShell>
  );
}
