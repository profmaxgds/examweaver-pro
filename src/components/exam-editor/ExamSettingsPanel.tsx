import { useExamEditor } from './ExamEditorContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ExamHeaderEditor } from '@/components/ExamHeaderEditor';

export function ExamSettingsPanel() {
  const { examData, setExamData } = useExamEditor();

  if (!examData) return null;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card>
        <CardHeader><CardTitle>Dados da Prova</CardTitle></CardHeader>
        <CardContent className="space-y-4">
            <div>
                <Label htmlFor="title">Título *</Label>
                <Input id="title" value={examData.title} onChange={(e) => setExamData(prev => prev ? { ...prev, title: e.target.value } : prev)} />
            </div>
            <div>
                <Label htmlFor="subject">Matéria *</Label>
                <Input id="subject" value={examData.subject} onChange={(e) => setExamData(prev => prev ? { ...prev, subject: e.target.value } : prev)} />
            </div>
            <div>
                <Label htmlFor="institution">Instituição</Label>
                <Input id="institution" value={examData.institution} onChange={(e) => setExamData(prev => prev ? { ...prev, institution: e.target.value } : prev)} />
            </div>
            <div>
                <Label htmlFor="examDate">Data da Prova</Label>
                <Input id="examDate" type="date" value={examData.examDate} onChange={(e) => setExamData(prev => prev ? { ...prev, examDate: e.target.value } : prev)} />
            </div>
            <div>
                <Label htmlFor="timeLimit">Tempo Limite (minutos)</Label>
                <Input id="timeLimit" type="number" value={examData.time_limit || ''} onChange={(e) => setExamData(prev => prev ? { ...prev, time_limit: e.target.value ? parseInt(e.target.value) : undefined } : prev)} placeholder="Ex: 120" />
            </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Configurações</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="layout">Layout</Label>
            <Select value={examData.layout} onValueChange={(value) => setExamData(prev => prev ? { ...prev, layout: value } : prev)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="single_column">Uma Coluna</SelectItem>
                    <SelectItem value="double_column">Duas Colunas</SelectItem>
                </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="versions">Número de Versões</Label>
            <Input id="versions" type="number" min="1" max="10" value={examData.versions} onChange={(e) => setExamData(prev => prev ? { ...prev, versions: parseInt(e.target.value) || 1 } : prev)} />
          </div>
          <div className="space-y-3 pt-2">
            <div className="flex items-center space-x-2">
              <Checkbox id="qrEnabled" checked={examData.qr_enabled} onCheckedChange={(checked) => setExamData(prev => prev ? { ...prev, qr_enabled: !!checked } : prev)} />
              <Label htmlFor="qrEnabled">QR Code Habilitado</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="shuffleQuestions" checked={examData.shuffleQuestions} onCheckedChange={(checked) => setExamData(prev => prev ? { ...prev, shuffleQuestions: !!checked } : prev)} />
              <Label htmlFor="shuffleQuestions">Embaralhar Questões</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="shuffleOptions" checked={examData.shuffleOptions} onCheckedChange={(checked) => setExamData(prev => prev ? { ...prev, shuffleOptions: !!checked } : prev)} />
              <Label htmlFor="shuffleOptions">Embaralhar Alternativas</Label>
            </div>
          </div>
        </CardContent>
      </Card>
      <ExamHeaderEditor
        selectedHeaderId={examData.header_id}
        onSelect={(header) => setExamData(prev => prev ? { ...prev, header_id: header.id } : prev)}
      />
    </div>
  );
}