import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "./i18n";

function LocaleProbe({ testId }: { testId: string }) {
  const { locale, t } = useI18n();
  return <span data-testid={testId}>{locale}:{t("review")}</span>;
}

describe("I18nProvider", () => {
  beforeEach(() => localStorage.clear());

  it("restores the selected English locale for every public page", () => {
    localStorage.setItem("unigate.topik.locale", "en");
    render(
      <I18nProvider>
        <LocaleProbe testId="selected-locale" />
      </I18nProvider>,
    );

    expect(screen.getByTestId("selected-locale")).toHaveTextContent("en:Review Answers");
  });
});
