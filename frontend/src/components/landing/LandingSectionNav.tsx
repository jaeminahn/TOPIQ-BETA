import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";

const sections = [
  { id: "intro", label: "navIntro" },
  { id: "tests", label: "navMockTests" },
  { id: "full-version", label: "navFullVersion" },
  { id: "topik-guide", label: "navAboutTopik" },
  { id: "topik-faq", label: "navFaq" },
] as const;

type SectionId = (typeof sections)[number]["id"];

export function LandingSectionNav() {
  const { t } = useI18n();
  const [activeId, setActiveId] = useState<SectionId>(sections[0].id);

  useEffect(() => {
    let frame = 0;

    const updateActiveSection = () => {
      frame = 0;
      const marker = window.innerHeight * 0.38;
      let current: SectionId = sections[0].id;

      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= marker) current = section.id;
      }

      setActiveId(current);
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateActiveSection);
    };

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    updateActiveSection();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

  return (
    <nav className="topiq-section-nav" aria-label={t("pageSections")}>
      <ol className="topiq-section-nav-list">
        {sections.map((section) => {
          const active = section.id === activeId;
          return (
            <li key={section.id}>
              <a href={`#${section.id}`} className={active ? "is-active" : ""} aria-current={active ? "location" : undefined}>
                <span>{t(section.label)}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
