import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "./i18n";

function LocaleProbe({ testId }: { testId: string }) {
  const { locale, t } = useI18n();
  return <span data-testid={testId}>{locale}:{t("review")}</span>;
}

describe("I18nProvider", () => {
  beforeEach(() => localStorage.clear());

  it("uses English by default", () => {
    render(
      <I18nProvider>
        <LocaleProbe testId="selected-locale" />
      </I18nProvider>,
    );

    expect(screen.getByTestId("selected-locale")).toHaveTextContent("en:Review Answers");
  });

  it("restores a previously selected Korean locale", () => {
    localStorage.setItem("unigate.topik.locale", "ko");
    render(
      <I18nProvider>
        <LocaleProbe testId="selected-locale" />
      </I18nProvider>,
    );

    expect(screen.getByTestId("selected-locale")).toHaveTextContent("ko:답안 검토");
  });
});
