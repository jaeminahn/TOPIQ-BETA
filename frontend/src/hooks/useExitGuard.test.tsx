import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useExitGuard } from "./useExitGuard";

function GuardedPage() {
  const navigate = useNavigate();
  const guard = useExitGuard(true);
  return <div>
    <button onClick={() => navigate("/next")}>나가기</button>
    {guard.blocked && <><span>차단됨</span><button onClick={guard.stay}>머무르기</button><button onClick={guard.leave}>확인 나가기</button></>}
  </div>;
}

describe("useExitGuard", () => {
  it("blocks data-router navigation until the user confirms", async () => {
    const router = createMemoryRouter([
      { path: "/", element: <GuardedPage /> },
      { path: "/next", element: <p>다음 화면</p> },
    ]);
    render(<RouterProvider router={router} />);
    await userEvent.click(screen.getByRole("button", { name: "나가기" }));
    expect(screen.getByText("차단됨")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    await userEvent.click(screen.getByRole("button", { name: "확인 나가기" }));
    expect(await screen.findByText("다음 화면")).toBeInTheDocument();
  });
});
