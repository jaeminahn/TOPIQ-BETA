export const adminExportDatasets = ["questions", "responses", "sessions"] as const;
export type AdminExportDataset = (typeof adminExportDatasets)[number];

export type AdminExportFilters = {
  mockTestId?: string;
  section?: "reading" | "listening";
  mode?: "timed" | "practice";
  status: "submitted" | "abandoned" | "all";
  from?: string;
  to?: string;
  itemType?: string;
  minAssignedCount: number;
  outcome: "all" | "answered" | "correct" | "incorrect" | "unanswered";
  rating: "all" | "none" | "1" | "2" | "3" | "4" | "5";
  resultEmail: "all" | "accepted" | "not_accepted";
};

export type SqlQuery = { text: string; values: unknown[] };
export type CsvColumn = { key: string; header: string };

export const columns: Record<AdminExportDataset, CsvColumn[]> = {
  questions: [
    "mock_test_id", "mock_test_slug", "mock_test_title_ko", "mock_test_title_en",
    "section", "set_id", "set_version", "test_position", "item_id", "item_version",
    "item_type", "primary_skill", "target_level", "predicted_difficulty", "irt_difficulty",
    "irt_discrimination", "question_prompt", "stem", "passage", "auxiliary_text",
    "highlight_text", "choice_1", "choice_2", "choice_3", "choice_4", "correct_answer",
    "explanation", "transcript_json", "visual_options_json", "content_json",
    "assigned_count", "answered_count", "unanswered_count", "correct_count", "incorrect_count",
    "answered_accuracy_pct", "overall_accuracy_pct", "option_1_count", "option_2_count",
    "option_3_count", "option_4_count", "option_1_pct", "option_2_pct", "option_3_pct",
    "option_4_pct", "avg_answered_response_time_ms", "median_answered_response_time_ms",
    "answer_changed_count", "answer_changed_rate_pct",
  ].map((key) => ({ key, header: key })),
  responses: [
    "session_id", "user_id", "mock_test_id", "mock_test_slug", "mock_test_title_ko",
    "mock_test_title_en", "mode", "status", "started_at", "completed_at",
    "timed_out_submission", "session_score", "max_score", "score_pct", "rating",
    "feedback_locale", "section", "set_id", "set_version", "item_order", "test_position",
    "item_id", "item_version", "item_type", "selected_option", "correct_answer",
    "response_outcome", "is_correct", "response_time_ms", "skipped", "timed_out",
    "answer_changed", "selection_count", "first_selected_at", "final_selected_at", "policy_version",
  ].map((key) => ({ key, header: key })),
  sessions: [
    "session_id", "user_id", "mock_test_id", "mock_test_slug", "mock_test_title_ko",
    "mock_test_title_en", "mode", "status", "started_at", "submitted_at", "abandoned_at",
    "completed_at", "duration_seconds", "timed_out_submission", "score", "max_score",
    "score_pct", "total_items", "answered_count", "unanswered_count", "correct_count",
    "incorrect_count", "rating", "feedback_locale", "result_email", "result_email_accepted",
  ].map((key) => ({ key, header: key })),
};

