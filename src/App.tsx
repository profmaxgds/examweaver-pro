import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import QuestionsPage from "./pages/QuestionsPage";
import NewQuestionPage from "./pages/NewQuestionPage";
import EditQuestionPage from "./pages/EditQuestionPage"; // 1. Importe a nova página
import ExamsPage from "./pages/ExamsPage";
import NewExamPage from "./pages/NewExamPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/questions" element={<ProtectedRoute><QuestionsPage /></ProtectedRoute>} />
            <Route path="/questions/new" element={<ProtectedRoute><NewQuestionPage /></ProtectedRoute>} />
            {/* 2. Adicione a nova rota aqui */}
            <Route path="/questions/:id/edit" element={<ProtectedRoute><EditQuestionPage /></ProtectedRoute>} />
            <Route path="/exams" element={<ProtectedRoute><ExamsPage /></ProtectedRoute>} />
            <Route path="/exams/new" element={<ProtectedRoute><NewExamPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;