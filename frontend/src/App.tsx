import { lazy } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { PageBoundary } from "./components/PageBoundary";
import { LandingPage } from "./pages/home";

const TestPage = lazy(() => import("./pages/exam").then(module => ({ default: module.TestPage })));
const ReviewPage = lazy(() => import("./pages/exam").then(module => ({ default: module.ReviewPage })));
const FeedbackPage = lazy(() => import("./pages/results").then(module => ({ default: module.FeedbackPage })));
const ResultsPage = lazy(() => import("./pages/results").then(module => ({ default: module.ResultsPage })));
const AdminPage = lazy(() => import("./pages/admin").then(module => ({ default: module.AdminPage })));

export default function App() {
  return (
    <PageBoundary>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/session/:sessionId" element={<TestPage />} />
        <Route path="/session/:sessionId/review" element={<ReviewPage />} />
        <Route path="/session/:sessionId/feedback" element={<FeedbackPage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/session/:sessionId/results" element={<LegacyResultsRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </PageBoundary>
  );
}

function LegacyResultsRedirect() {
  const { sessionId } = useParams();
  return <Navigate to={sessionId ? `/session/${sessionId}/feedback` : "/"} replace />;
}
