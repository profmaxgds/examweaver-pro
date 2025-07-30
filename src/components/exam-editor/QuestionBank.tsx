import { useState, useEffect } from 'react';
import { useExamEditor } from './ExamEditorContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Search, Eye, Edit } from 'lucide-react';

const getTypeLabel = (type: string) => ({
  'multiple_choice': 'Múltipla Escolha', 'true_false': 'V/F', 'essay': 'Dissertativa'
}[type] || type);

const getDifficultyLabel = (difficulty: string) => ({
  'easy': 'Fácil', 'medium': 'Médio', 'hard': 'Difícil', 'custom': 'Custom'
}[difficulty] || difficulty);

export function QuestionBank() {
  const { allQuestions, examData, toggleQuestionSelection, setPreviewQuestion, setEditQuestion } = useExamEditor();
  const [filteredQuestions, setFilteredQuestions] = useState(allQuestions);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterType, setFilterType] = useState('');

  const subjects = [...new Set(allQuestions.map(q => q.subject))].filter(Boolean);
  const difficulties = ['easy', 'medium', 'hard', 'custom'];
  const types = ['multiple_choice', 'true_false', 'essay'];

  useEffect(() => {
    let filtered = allQuestions;

    if (searchTerm) {
      filtered = filtered.filter(q =>
        q.title.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (filterSubject) filtered = filtered.filter(q => q.subject === filterSubject);
    if (filterDifficulty) filtered = filtered.filter(q => q.difficulty === filterDifficulty);
    if (filterType) filtered = filtered.filter(q => q.type === filterType);
    
    setFilteredQuestions(filtered);
  }, [allQuestions, searchTerm, filterSubject, filterDifficulty, filterType]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Banco de Questões</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          <div className="relative lg:col-span-4">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por título..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterSubject} onValueChange={(v) => setFilterSubject(v === 'all' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Matéria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {subjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterDifficulty} onValueChange={(v) => setFilterDifficulty(v === 'all' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Dificuldade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {difficulties.map(d => <SelectItem key={d} value={d}>{getDifficultyLabel(d)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={(v) => setFilterType(v === 'all' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {types.map(t => <SelectItem key={t} value={t}>{getTypeLabel(t)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
          {filteredQuestions.map((question) => {
            const isSelected = examData?.selectedQuestions.some(q => q.id === question.id);
            return (
              <div
                key={question.id}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                onClick={() => toggleQuestionSelection(question)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <h4 className="font-medium text-sm">{question.title}</h4>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs">{getTypeLabel(question.type)}</Badge>
                      <Badge variant="outline" className="text-xs">{getDifficultyLabel(question.difficulty)}</Badge>
                      <Badge variant="outline" className="text-xs">{question.points} pts</Badge>
                      <Badge variant="secondary" className="text-xs">{question.subject}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 ml-2">
                     <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setPreviewQuestion(question); }}>
                        <Eye className="w-4 h-4" />
                    </Button>
                     <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setEditQuestion(question); }}>
                        <Edit className="w-4 h-4" />
                    </Button>
                    <Checkbox checked={!!isSelected} className="ml-2" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}