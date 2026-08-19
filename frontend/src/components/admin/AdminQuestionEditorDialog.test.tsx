import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "../../api";
import { AdminQuestionEditorDialog, type EditableAdminQuestion } from "./AdminQuestionEditorDialog";
import { I18nProvider } from "../../i18n";

vi.mock("../../api", () => ({ adminApi: { reviseQuestionSet: vi.fn() } }));

const first: EditableAdminQuestion = {
  position: 1, itemId: "30000000-0000-4000-8000-000000000001", itemVersion: 1,
  stem: "", choices: ["하나", "둘", "셋", "넷"], correctAnswer: 1, explanation: "해설",
  contentJson: { question_prompt: "들은 내용", dialogue_turns: [{ speaker: "여자", text: "안녕하세요" }], repeat_count: 1, choices: ["하나", "둘", "셋", "넷"] },
};
const second: EditableAdminQuestion = {
  ...first, position: 2, itemId: "30000000-0000-4000-8000-000000000002", contentJson: { ...first.contentJson, question_prompt: "알맞은 답" },
};

describe("AdminQuestionEditorDialog", () => {
  beforeEach(() => vi.mocked(adminApi.reviseQuestionSet).mockResolvedValue({ setId: "set-1", setVersion: 2, mockTestIds: [], published: false, revisions: [] }));

  it("versions every target when a shared listening transcript changes", async () => {
    const saved = vi.fn();
    render(<I18nProvider><AdminQuestionEditorDialog token="admin-token" section="listening" setId="set-1" setVersion={1} question={first} groupQuestions={[first, second]} onClose={vi.fn()} onSaved={saved} /></I18nProvider>);
    const transcript = screen.getByLabelText(/공통 대본/);
    await userEvent.clear(transcript);
    await userEvent.type(transcript, "여자|수정한 대본");
    await userEvent.click(screen.getByRole("button", { name: /새 버전 저장/ }));

    await waitFor(() => expect(adminApi.reviseQuestionSet).toHaveBeenCalled());
    const revisions = vi.mocked(adminApi.reviseQuestionSet).mock.calls[0]?.[3];
    expect(revisions).toHaveLength(2);
    expect(revisions?.every((revision) => revision.contentJson.dialogue_turns)).toBe(true);
    expect(saved).toHaveBeenCalledWith(2);
  });
});
