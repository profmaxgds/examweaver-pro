import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Upload, Eye } from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface Option {
  id: string;
  text: string;
  isCorrect: boolean;
}

interface QuestionData {
  title: string;
  content: string;
  type: 'multiple_choice' | 'true_false' | 'essay' | 'fill_blanks';
  options: Option[];
  correctAnswer: any;
  category: string;
  subject: string;
  institution: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'custom';
  tags: string[];
  points: number;
  language: string;
}

interface QuestionEditorProps {
  onSave: (question: QuestionData) => void;
  initialData?: Partial<QuestionData>;
  loading?: boolean;
}

export function QuestionEditor({ onSave, initialData, loading }: QuestionEditorProps) {
  const [activeTab, setActiveTab] = useState('editor');
  const [question, setQuestion] = useState<QuestionData>({
    title: initialData?.title || '',
    content: initialData?.content || '',
    type: initialData?.type || 'multiple_choice',
    options: initialData?.options || [
      { id: '1', text: '', isCorrect: false },
      { id: '2', text: '', isCorrect: false },
      { id: '3', text: '', isCorrect: false },
      { id: '4', text: '', isCorrect: false },
    ],
    correctAnswer: initialData?.correctAnswer || null,
    category: initialData?.category || '',
    subject: initialData?.subject || '',
    institution: initialData?.institution || '',
    difficulty: initialData?.difficulty || 'medium',
    tags: initialData?.tags || [],
    points: initialData?.points || 1.0,
    language: initialData?.language || 'pt',
  });

  const [newTag, setNewTag] = useState('');

  const addOption = () => {
    const newId = (question.options.length + 1).toString();
    setQuestion(prev => ({
      ...prev,
      options: [...prev.options, { id: newId, text: '', isCorrect: false }]
    }));
  };

  const removeOption = (id: string) => {
    if (question.options.length <= 2) return;
    setQuestion(prev => ({
      ...prev,
      options: prev.options.filter(opt => opt.id !== id)
    }));
  };

  const updateOption = (id: string, text: string) => {
    setQuestion(prev => ({
      ...prev,
      options: prev.options.map(opt => 
        opt.id === id ? { ...opt, text } : opt
      )
    }));
  };

  const toggleCorrectOption = (id: string) => {
    setQuestion(prev => ({
      ...prev,
      options: prev.options.map(opt => 
        opt.id === id 
          ? { ...opt, isCorrect: !opt.isCorrect }
          : { ...opt, isCorrect: false } // Apenas uma resposta correta para múltipla escolha
      )
    }));
  };

  const addTag = () => {
    if (newTag.trim() && !question.tags.includes(newTag.trim())) {
      setQuestion(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setQuestion(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  const handleSave = () => {
    // Validação básica
    if (!question.title.trim() || !question.content.trim() || !question.subject.trim()) {
      alert('Por favor, preencha os campos obrigatórios: título, conteúdo e matéria.');
      return;
    }

    if (question.type === 'multiple_choice') {
      const hasCorrectAnswer = question.options.some(opt => opt.isCorrect);
      const allOptionsFilled = question.options.every(opt => opt.text.trim());
      
      if (!hasCorrectAnswer) {
        alert('Por favor, marque a alternativa correta.');
        return;
      }
      
      if (!allOptionsFilled) {
        alert('Por favor, preencha todas as alternativas.');
        return;
      }
    }

    onSave(question);
  };

  const modules = {
    toolbar: [
      [{ 'header': [1, 2, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'color': [] }, { 'background': [] }],
      ['link', 'image'],
      ['formula'],
      ['clean']
    ],
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex justify-between items-center">
          <TabsList>
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="preview">
              <Eye className="w-4 h-4 mr-2" />
              Pré-visualização
            </TabsTrigger>
          </TabsList>
          
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar Questão'}
          </Button>
        </div>

        <TabsContent value="editor" className="grid gap-6 lg:grid-cols-3">
          {/* Editor Principal */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Dados da Questão</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title"
                    value={question.title}
                    onChange={(e) => setQuestion(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Ex: Conceitos de Teoria Geral dos Sistemas"
                  />
                </div>

                <div>
                  <Label htmlFor="content">Enunciado *</Label>
                  <ReactQuill
                    value={question.content}
                    onChange={(content) => setQuestion(prev => ({ ...prev, content }))}
                    modules={modules}
                    placeholder="Digite o enunciado da questão..."
                    style={{ height: '200px' }}
                  />
                </div>
              </CardContent>
            </Card>

            {question.type === 'multiple_choice' && (
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Alternativas</CardTitle>
                    <Button variant="outline" size="sm" onClick={addOption}>
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {question.options.map((option, index) => (
                    <div key={option.id} className="flex items-center space-x-3">
                      <span className="font-medium text-sm w-8">
                        {String.fromCharCode(97 + index)})
                      </span>
                      <Input
                        value={option.text}
                        onChange={(e) => updateOption(option.id, e.target.value)}
                        placeholder={`Alternativa ${String.fromCharCode(97 + index)}`}
                        className="flex-1"
                      />
                      <Button
                        variant={option.isCorrect ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleCorrectOption(option.id)}
                      >
                        {option.isCorrect ? 'Correta' : 'Marcar'}
                      </Button>
                      {question.options.length > 2 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeOption(option.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar de Metadados */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Configurações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="type">Tipo de Questão</Label>
                  <Select value={question.type} onValueChange={(value: any) => setQuestion(prev => ({ ...prev, type: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="multiple_choice">Múltipla Escolha</SelectItem>
                      <SelectItem value="true_false">Verdadeiro/Falso</SelectItem>
                      <SelectItem value="essay">Dissertativa</SelectItem>
                      <SelectItem value="fill_blanks">Preencher Lacunas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="subject">Matéria *</Label>
                  <Input
                    id="subject"
                    value={question.subject}
                    onChange={(e) => setQuestion(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Ex: Teoria Geral dos Sistemas"
                  />
                </div>

                <div>
                  <Label htmlFor="category">Categoria</Label>
                  <Input
                    id="category"
                    value={question.category}
                    onChange={(e) => setQuestion(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="Ex: Sistemas Abertos"
                  />
                </div>

                <div>
                  <Label htmlFor="institution">Instituição</Label>
                  <Input
                    id="institution"
                    value={question.institution}
                    onChange={(e) => setQuestion(prev => ({ ...prev, institution: e.target.value }))}
                    placeholder="Ex: UNIUBE"
                  />
                </div>

                <div>
                  <Label htmlFor="difficulty">Dificuldade</Label>
                  <Select value={question.difficulty} onValueChange={(value: any) => setQuestion(prev => ({ ...prev, difficulty: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Fácil</SelectItem>
                      <SelectItem value="medium">Médio</SelectItem>
                      <SelectItem value="hard">Difícil</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="points">Pontuação</Label>
                  <Input
                    id="points"
                    type="number"
                    step="0.25"
                    min="0"
                    value={question.points}
                    onChange={(e) => setQuestion(prev => ({ ...prev, points: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex space-x-2">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Nova tag"
                    onKeyPress={(e) => e.key === 'Enter' && addTag()}
                  />
                  <Button variant="outline" size="sm" onClick={addTag}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {question.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeTag(tag)}>
                      {tag} ×
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="preview">
          <Card>
            <CardHeader>
              <CardTitle>Pré-visualização da Questão</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">{question.title}</h3>
                <div 
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: question.content }}
                />
              </div>

              {question.type === 'multiple_choice' && (
                <div className="space-y-2">
                  {question.options.map((option, index) => (
                    <div key={option.id} className="flex items-center space-x-2">
                      <span className="font-medium">
                        {String.fromCharCode(97 + index)})
                      </span>
                      <span>{option.text}</span>
                      {option.isCorrect && (
                        <Badge variant="default" className="ml-2">Correta</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-4 border-t">
                <Badge variant="outline">{question.difficulty}</Badge>
                <Badge variant="outline">{question.points} pontos</Badge>
                <Badge variant="outline">{question.subject}</Badge>
                {question.category && <Badge variant="outline">{question.category}</Badge>}
                {question.tags.map(tag => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}