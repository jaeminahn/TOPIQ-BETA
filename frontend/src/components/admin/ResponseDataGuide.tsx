import {
  Activity, Clock3, Database, Headphones, KeyRound, MailCheck,
  MessageSquareText, ShieldCheck, Star, Trash2,
} from "lucide-react";

const groups = [
  {
    icon: KeyRound,
    title: "익명 사용자와 응시 세션",
    description: "계정 대신 임시 사용자 UUID로 한 번의 응시 흐름을 구분합니다.",
    fields: ["사용자·세션 UUID", "시험과 실전/연습 모드", "시작·만료·제출·최근 접속 시각", "진행 상태, 점수, 만점, 시간 초과 제출 여부"],
  },
  {
    icon: Database,
    title: "출제 문항 스냅샷",
    description: "응시 당시 어떤 세트와 문항 버전이 몇 번 위치에 출제됐는지 저장합니다.",
    fields: ["영역과 시험 내 문항 순서", "세트·문항 ID 및 버전", "배점과 출제 정책 버전", "능력 추정 전·후 값(사용하는 경우)"],
  },
  {
    icon: MessageSquareText,
    title: "답안과 최종 응답",
    description: "현재 선택과 제출 시점의 최종 결과를 문항별로 기록합니다.",
    fields: ["선택 번호와 최초·최종 선택 시각", "선택 횟수와 답안 변경 여부", "정답 여부와 응답 시간", "건너뜀·시간 초과 미응답 여부"],
  },
  {
    icon: Activity,
    title: "문항 행동 이벤트",
    description: "문항에 실제로 머문 시간을 계산하고 중복 전송을 막기 위한 이벤트를 저장합니다.",
    fields: ["문항 표시·숨김·heartbeat", "답안 선택·변경", "이벤트별 활성 시간", "중복 방지용 클라이언트 이벤트 ID와 생성 시각"],
  },
  {
    icon: Headphones,
    title: "듣기 음원 재생",
    description: "듣기 재생 제한과 이용 흐름 확인을 위해 실제 재생 이벤트를 남깁니다.",
    fields: ["음원 자산 ID", "재생 시작·완료·중단", "재생 회차", "재생 단위 ID와 생성 시각"],
  },
  {
    icon: Star,
    title: "결과 피드백",
    description: "결과 확인 과정에서 제출한 평가 정보를 세션과 연결합니다.",
    fields: ["1~5점 별점", "선택 언어", "생성·수정 시각", "결과 확인이 열린 시각"],
  },
  {
    icon: MailCheck,
    title: "이메일 수신 동의",
    description: "마케팅 수신에 명시적으로 동의하고 이메일을 입력한 경우에만 별도로 저장합니다.",
    fields: ["원본·정규화 이메일", "선택 언어와 유입 경로", "동의·수신 거부 시각", "응답 세션 삭제 후에도 유지되는 구독 상태"],
  },
];

export function ResponseDataGuide() {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-7">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-xs font-semibold tracking-[.14em] text-primary">RESPONSE DATA GUIDE</p>
          <h2 className="mt-2 text-2xl font-semibold">응답 데이터 저장 안내</h2>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-gray-500">이 페이지는 애플리케이션 데이터베이스에 저장되는 응시·응답 관련 정보를 기준으로 설명합니다. 인프라 및 서버 접근 로그는 이 안내의 범위에 포함되지 않습니다.</p>
        </div>
        <span className="flex w-fit items-center gap-2 rounded-full bg-green-50 px-3 py-2 text-xs font-semibold text-green-700"><ShieldCheck className="size-4" />원본 접근 토큰 미저장</span>
      </div>

      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map(({ icon: Icon, title, description, fields }) => (
          <article key={title} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <div className="grid size-10 place-items-center rounded-xl bg-primary-50 text-primary"><Icon className="size-5" /></div>
            <h3 className="mt-4 text-base font-semibold text-gray-900">{title}</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-gray-500">{description}</p>
            <ul className="mt-4 space-y-2 text-sm text-gray-700">
              {fields.map((field) => <li key={field} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />{field}</li>)}
            </ul>
          </article>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-primary-100 bg-primary-50 p-5">
          <h3 className="flex items-center gap-2 font-semibold text-primary-dark"><KeyRound className="size-5" />접근 정보 보호</h3>
          <p className="mt-2 text-sm font-medium leading-6 text-gray-700">응시용 원본 접근 토큰은 데이터베이스에 저장하지 않고 SHA-256 해시만 저장합니다. 관리자 응답 화면에도 토큰이나 이메일은 노출하지 않습니다.</p>
        </article>
        <article className="rounded-2xl border border-red-100 bg-red-50 p-5">
          <h3 className="flex items-center gap-2 font-semibold text-red-700"><Trash2 className="size-5" />응답 삭제 시 처리</h3>
          <p className="mt-2 text-sm font-medium leading-6 text-gray-700">세션, 답안 상태·이벤트, 최종 응답, 별점과 음원 재생 기록은 함께 삭제됩니다. 이메일 수신 동의는 세션 연결만 해제하고 유지하며, 삭제 범위·건수·실행 관리자·시각은 감사 기록으로 남습니다.</p>
        </article>
      </div>

      <p className="mt-5 flex items-center gap-2 text-xs font-medium text-gray-400"><Clock3 className="size-4" />문항 응답 시간은 문항별 활성 시간 이벤트를 합산해 제출 시 최종 확정합니다.</p>
    </section>
  );
}
