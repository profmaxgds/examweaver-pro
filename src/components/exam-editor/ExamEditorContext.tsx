import { createContext, useContext } from 'react';

// Definindo os tipos para os dados do contexto
interface Question {
  id: string;
  title: string;
  content: any;
  type: string;
  subject: string;
  category: string | null;
  difficulty: string;
  tags: string[];
  points: number;
  options: any[] | null;
  correct_answer: any;
}

interface ExamData {
  id: string;
  title: string;
  subject: string;
  institution: string;
  examDate: string;
  selectedQuestions: Question[];
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  versions: number;
  layout: string;
  header_id?: string;
  qr_enabled: boolean;
  time_limit?: number;
  generation_mode?: 'versions' | 'class';
  target_class_id?: string;
  professor_name?: string;
}

interface ExamEditorContextType {
  examData: ExamData | null;
  setExamData: React.Dispatch<React.SetStateAction<ExamData | null>>;
  allQuestions: Question[];
  toggleQuestionSelection: (question: Question) => void;
  removeSelectedQuestion: (questionId: string) => void;
  loading: boolean;
  isPreparing: boolean;
  setPreviewQuestion: (question: Question | null) => void;
  setEditQuestion: (question: Question | null) => void;
  handleSave: () => Promise<void>;
  handlePrepareExams: () => Promise<void>;
  previewExam: (version?: number | string, includeAnswers?: boolean) => Promise<void>;
  generatePDF: (version?: number | string, includeAnswers?: boolean) => Promise<void>;
  generateAllPDFs: () => Promise<void>;
  toast: (options: any) => void;
}

// Criando o contexto
export const ExamEditorContext = createContext<ExamEditorContextType | null>(null);

// Hook customizado para usar o contexto
export const useExamEditor = () => {
  const context = useContext(ExamEditorContext);
  if (!context) {
    throw new Error('useExamEditor must be used within an ExamEditorProvider');
  }
  return context;
};