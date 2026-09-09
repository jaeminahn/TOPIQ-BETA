import type { Locale } from "./i18n";

const sectionNames = {
  reading: "Reading",
  listening: "Listening",
  writing: "Writing",
} as const;

type ExamSection = keyof typeof sectionNames;

function inferSection(titleKo: string, slug = ""): ExamSection | null {
  const value = `${slug} ${titleKo}`.toLowerCase();
  if (value.includes("listening") || value.includes("듣기")) return "listening";
  if (value.includes("reading") || value.includes("읽기")) return "reading";
  if (value.includes("writing") || value.includes("쓰기")) return "writing";
  return null;
}

function inferRound(titleKo: string, slug = "") {
  const slugRound = /-(\d+)$/.exec(slug)?.[1];
  return slugRound ?? /(\d+)\s*회/.exec(titleKo)?.[1] ?? null;
}

export function localizedExamTitle(
  titleKo: string,
  locale: Locale,
  options: { slug?: string; section?: ExamSection; titleEn?: string } = {},
) {
  if (locale === "ko") return titleKo;
  if (options.titleEn) return options.titleEn;
  const section = options.section ?? inferSection(titleKo, options.slug);
  const round = inferRound(titleKo, options.slug);
  if (!section) return "TOPIK II Mock Test";
  return `TOPIK II ${sectionNames[section]} Mock Test${round ? ` ${round}` : ""}`;
}
