import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import "./index.css";
import { CreatePage } from "./pages/Create";
import { DashboardPage } from "./pages/Dashboard";
import { HowItWorksPage } from "./pages/HowItWorks";
import { JobPage } from "./pages/Job";
import { LibraryPage } from "./pages/Library";
import { LoginPage } from "./pages/Login";
import { EditorPage } from "./pages/Editor";
import { ClipperPage } from "./pages/Clipper";
import { AuthProvider } from "./lib/auth";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<CreatePage />} />
          <Route path="/jobs/:id" element={<JobPage />} />
          <Route path="/jobs/:id/edit" element={<EditorPage />} />
          <Route path="/clipper" element={<ClipperPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<CreatePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
