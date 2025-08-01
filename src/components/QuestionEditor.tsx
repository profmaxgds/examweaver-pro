import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Eye } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Editor } from '@tinymce/tinymce-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth'; // <-- ADICIONADO

interface Option {
  id: string;
  text: string;
  isCorrect: boolean;
}

interface QuestionData {
  title: string;
  content: string;
  type: 'multiple_choice' | 'true_false' | 'essay';
  options: Option[];
  correctAnswer: any;
  category: string;
  subject: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  points: number;
}

interface QuestionEditorProps {
  onSave: (question: QuestionData) => void;
  initialData?: Partial<QuestionData>;
  loading?: boolean;
}

export function QuestionEditor({ onSave, initialData, loading }: QuestionEditorProps) {
  const { user } = useAuth(); // <-- ADICIONADO
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
    correctAnswer: initialData?.correctAnswer ?? null,
    category: initialData?.category || '',
    subject: initialData?.subject || '',
    difficulty: initialData?.difficulty || 'medium',
    tags: initialData?.tags || [],
    points: initialData?.points || 1.0,
  });

  const [newTag, setNewTag] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (initialData) {
      setQuestion(prev => ({
        ...prev,
        ...initialData,
        options: initialData.options || prev.options,
        correctAnswer: initialData.correctAnswer ?? null,
      }));
    }
  }, [initialData]);
  
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
          ? { ...opt, isCorrect: true }
          : { ...opt, isCorrect: false }
      )
    }));
  };
  
  const handleCorrectAnswerChange = (value: any) => {
    setQuestion(prev => ({ ...prev, correctAnswer: value }));
  };

  const addTag = () => {
    if (newTag.trim() && !question.tags.includes(newTag.trim())) {
      setQuestion(prev => ({ ...prev, tags: [...prev.tags, newTag.trim()] }));
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setQuestion(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const handleSave = () => {
    if (!question.title.trim() || !question.content.trim() || !question.subject.trim()) {
      toast({
        title: "Campos Obrigatórios",
        description: "Por favor, preencha o título, enunciado e matéria.",
        variant: "destructive",
      });
      return;
    }
    if (question.type === 'multiple_choice' && !question.options.some(opt => opt.isCorrect)) {
       toast({
        title: "Seleção Necessária",
        description: "Por favor, marque a alternativa correta.",
        variant: "destructive",
      });
      return;
    }
    if (question.type === 'true_false' && question.correctAnswer === null) {
       toast({
        title: "Seleção Necessária",
        description: "Por favor, selecione se a resposta é Verdadeiro ou Falso.",
        variant: "destructive",
      });
      return;
    }
    onSave(question);
  };

  const handleImageUpload = async (blobInfo: any): Promise<string> => {
    // MODIFICAÇÃO INICIA AQUI
    if (!user) {
      toast({
          title: "Erro de Autenticação",
          description: "Você precisa estar logado para enviar imagens.",
          variant: "destructive",
      });
      throw new Error("Usuário não autenticado");
    }

    const file = blobInfo.blob();
    const fileName = `${user.id}/${Date.now()}-${blobInfo.filename()}`;
    // MODIFICAÇÃO TERMINA AQUI
    
    try {
      const { data, error } = await supabase.storage
        .from('question-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        throw error;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('question-images')
        .getPublicUrl(fileName);

      toast({ title: "Sucesso!", description: "Imagem enviada com sucesso." });
      return publicUrl;
    } catch (error) {
      console.error('Erro no upload da imagem:', error);
      toast({
        title: "Erro de Upload",
        description: "Não foi possível enviar a imagem.",
        variant: "destructive",
      });
      throw new Error("Falha no upload da imagem");
    }
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
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Dados da Questão</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">Título (Tópico para organização) *</Label>
                  <Input
                    id="title"
                    value={question.title}
                    onChange={(e) => setQuestion(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Ex: Conceitos de Teoria Geral dos Sistemas"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="content">Enunciado *</Label>
                  <Editor
                    apiKey={import.meta.env.VITE_TINYMCE_API_KEY}
                    value={question.content}
                    onEditorChange={(content) => setQuestion(prev => ({ ...prev, content }))}
                    init={{
                      height: 400,
                      menubar: false,
                      language: 'pt_BR',
                      language_url: '/langs/pt_BR.js',
                      statusbar: false,
                      branding: false,
                      plugins: [
                        'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
                        'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
                        'insertdatetime', 'media', 'table', 'help', 'wordcount'
                      ],
                      toolbar: [
                        'undo redo | cut copy paste | blocks fontfamily fontsize | bold italic underline forecolor backcolor',
                        'alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | image table | fullscreen preview removeformat'
                      ],
                      font_family_formats: "Andale Mono=andale mono,times; Arial=arial,helvetica,sans-serif; Arial Black=arial black,avant garde; Book Antiqua=book antiqua,palatino; Comic Sans MS=comic sans ms,sans-serif; Courier New=courier new,courier; Georgia=georgia,palatino; Helvetica=helvetica; Impact=impact,chicago; Symbol=symbol; Tahoma=tahoma,arial,helvetica,sans-serif; Terminal=terminal,monaco; Times New Roman=times new roman,times; Trebuchet MS=trebuchet ms,geneva; Verdana=verdana,geneva; Webdings=webdings; Wingdings=wingdings,zapf dingbats",
                      font_size_formats: "8pt 10pt 12pt 14pt 18pt 24pt 36pt",
                      content_style: 'body { font-family:Helvetica,Arial,sans-serif; font-size:14px }',
                      image_advtab: true,
                      image_caption: true,
                      automatic_uploads: true,
                      file_picker_types: 'image',
                      images_upload_handler: handleImageUpload,
                    }}
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
                          variant="destructive"
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

            {question.type === 'true_false' && (
              <Card>
                <CardHeader><CardTitle>Resposta Correta</CardTitle></CardHeader>
                <CardContent>
                  <RadioGroup
                    onValueChange={(value) => handleCorrectAnswerChange(value === 'true')}
                    value={question.correctAnswer === null ? '' : String(question.correctAnswer)}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="true" id="true" />
                      <Label htmlFor="true">Verdadeiro</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="false" id="false" />
                      <Label htmlFor="false">Falso</Label>
                    </div>
                  </RadioGroup>
                </CardContent>
              </Card>
            )}

            {question.type === 'essay' && (
               <Card>
                <CardHeader><CardTitle>Resposta Esperada / Critérios de Correção</CardTitle></CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Descreva a resposta ideal ou os critérios para a correção..."
                    value={question.correctAnswer || ''}
                    onChange={(e) => handleCorrectAnswerChange(e.target.value)}
                    rows={5}
                  />
                </CardContent>
              </Card>
            )}
            
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Configurações</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="type">Tipo de Questão</Label>
                  <Select 
                    value={question.type} 
                    onValueChange={(value: 'multiple_choice' | 'true_false' | 'essay') => {
                      setQuestion(prev => {
                        const newQuestion = { ...prev, type: value };
                        
                        // Reset correctAnswer based on type
                        if (value === 'multiple_choice') {
                          newQuestion.correctAnswer = null;
                          newQuestion.options = prev.options.map(o => ({ ...o, isCorrect: false }));
                        } else if (value === 'true_false') {
                          newQuestion.correctAnswer = null;
                          newQuestion.options = [];
                        } else if (value === 'essay') {
                          newQuestion.correctAnswer = '';
                          newQuestion.options = [];
                        }
                        
                        return newQuestion;
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background border z-50">
                      <SelectItem value="multiple_choice">Múltipla Escolha</SelectItem>
                      <SelectItem value="true_false">Verdadeiro/Falso</SelectItem>
                      <SelectItem value="essay">Dissertativa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="subject">Matéria *</Label>
                  <Input id="subject" value={question.subject} onChange={(e) => setQuestion(prev => ({ ...prev, subject: e.target.value }))} placeholder="Ex: Teoria Geral dos Sistemas" />
                </div>
                <div>
                  <Label htmlFor="category">Categoria (opcional)</Label>
                  <Input 
                    id="category" 
                    value={question.category} 
                    onChange={(e) => setQuestion(prev => ({ ...prev, category: e.target.value }))} 
                    placeholder="Ex: Sistemas Abertos, Conceitos Básicos" 
                  />
                </div>
                <div>
                  <Label htmlFor="difficulty">Dificuldade</Label>
                  <Select value={question.difficulty} onValueChange={(value: 'easy' | 'medium' | 'hard') => setQuestion(prev => ({ ...prev, difficulty: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background border z-50">
                      <SelectItem value="easy">Fácil</SelectItem>
                      <SelectItem value="medium">Médio</SelectItem>
                      <SelectItem value="hard">Difícil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="points">Pontuação</Label>
                  <Input 
                    id="points" 
                    type="number" 
                    step="0.5" 
                    min="0.5" 
                    max="10" 
                    value={question.points} 
                    onChange={(e) => setQuestion(prev => ({ ...prev, points: parseFloat(e.target.value) || 1 }))} 
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Tags</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex space-x-2">
                  <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Nova tag" onKeyPress={(e) => e.key === 'Enter' && addTag()} />
                  <Button variant="outline" size="sm" onClick={addTag}><Plus className="w-4 h-4" /></Button>
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
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: question.content }}
              />
               {question.type === 'multiple_choice' && (
                <ol className="list-decimal list-inside space-y-2">
                  {question.options.map((option) => (
                    <li key={option.id} className={option.isCorrect ? 'font-bold text-green-700' : ''}>
                      {option.text}
                    </li>
                  ))}
                </ol>
              )}
               {question.type === 'true_false' && (
                <p>Resposta: <Badge variant={question.correctAnswer ? 'default' : 'destructive'}>{question.correctAnswer ? 'Verdadeiro' : 'Falso'}</Badge></p>
              )}
              <div className="flex flex-wrap gap-2 pt-4 border-t">
                <Badge variant="outline">{question.difficulty}</Badge>
                <Badge variant="outline">{question.points} pontos</Badge>
                <Badge variant="secondary">{question.subject}</Badge>
                {question.category && <Badge variant="outline">{question.category}</Badge>}
                {question.tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}