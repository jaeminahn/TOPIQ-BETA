import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, useLocation, useParams } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "./i18n";
import App from "./App";

const loaded = vi.hoisted(() => ({ exam: false, results: false, admin: false }));
vi.mock("./pages/home", () => ({ LandingPage: () => <h1>Home page</h1> }));
vi.mock("./pages/exam", () => {
  loaded.exam = true;
  return {
    TestPage: () => <><h1>Exam {useParams().sessionId}</h1><Link to="review">Review answers</Link></>,
    ReviewPage: () => {
      const { sessionId } = useParams();
      return <><h1>Review {sessionId}</h1><Link to={`/session/${sessionId}/feedback`}>Submit exam</Link></>;
    },
  };
});
vi.mock("./pages/results", () => {
  loaded.results = true;
  return {
    FeedbackPage: () => <h1>Feedback {useParams().sessionId}</h1>,
    ResultsPage: () => <h1>Results {useLocation().hash}</h1>,
  };
});
vi.mock("./pages/admin", () => {
  loaded.admin = true;
  return { AdminPage: () => <h1>Admin page</h1> };
});

function open(path: string) {
  render(<MemoryRouter initialEntries={[path]}><I18nProvider locale="en"><App /></I18nProvider></MemoryRouter>);
}

describe("page group routing", () => {
  it("opens home without loading any other page group", () => {
    open("/");
    expect(screen.getByRole("heading", { name: "Home page" })).toBeInTheDocument();
    expect(loaded).toEqual({ exam: false, results: false, admin: false });
  });

  it.each([
    ["/session/abc", "Exam abc"],
    ["/session/abc/review", "Review abc"],
    ["/session/abc/feedback", "Feedback abc"],
    ["/results#token=keep-this-token", "Results #token=keep-this-token"],
    ["/admin", "Admin page"],
    ["/session/abc/results", "Feedback abc"],
    ["/unknown", "Home page"],
  ])("preserves direct entry at %s", async (path, heading) => {
    open(path);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("keeps the session identifier across exam, review, and feedback navigation", async () => {
    open("/session/current-session");
    fireEvent.click(await screen.findByRole("link", { name: "Review answers" }));
    expect(await screen.findByRole("heading", { name: "Review current-session" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Submit exam" }));
    expect(await screen.findByRole("heading", { name: "Feedback current-session" })).toBeInTheDocument();
  });
});
