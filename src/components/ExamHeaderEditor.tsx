import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Building } from 'lucide-react';
import { FileUpload } from './FileUpload';

interface ExamHeader {
  id: string;
  name: string;
  institution: string;
  logo_url?: string;
  content: any;
  is_default: boolean;
}

interface ExamHeaderEditorProps {
  onSelect?: (header: ExamHeader) => void;
  selectedHeaderId?: string;
}

export function ExamHeaderEditor({ onSelect, selectedHeaderId }: ExamHeaderEditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [headers, setHeaders] = useState<ExamHeader[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHeader, setEditingHeader] = useState<ExamHeader | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    institution: '',
    logo_url: '',
    content: {
      title: '',
      subtitle: '',
      address: '',
      phone: '',
      email: '',
      website: ''
    },
    is_default: false
  });

  useEffect(() => {
    fetchHeaders();
  }, [user]);

  const fetchHeaders = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('exam_headers')
        .select('*')
        .eq('author_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHeaders(data || []);
    } catch (error) {
      console.error('Erro ao buscar cabeçalhos:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os cabeçalhos.",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      institution: '',
      logo_url: '',
      content: {
        title: '',
        subtitle: '',
        address: '',
        phone: '',
        email: '',
        website: ''
      },
      is_default: false
    });
    setEditingHeader(null);
  };

  const openDialog = (header?: ExamHeader) => {
    if (header) {
      setFormData({
        name: header.name,
        institution: header.institution,
        logo_url: header.logo_url || '',
        content: header.content || {
          title: '',
          subtitle: '',
          address: '',
          phone: '',
          email: '',
          website: ''
        },
        is_default: header.is_default
      });
      setEditingHeader(header);
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;

    if (!formData.name.trim() || !formData.institution.trim()) {
      toast({
        title: "Erro",
        description: "Nome e instituição são obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const data = {
        author_id: user.id,
        name: formData.name,
        institution: formData.institution,
        logo_url: formData.logo_url || null,
        content: formData.content,
        is_default: formData.is_default
      };

      if (editingHeader) {
        const { error } = await supabase
          .from('exam_headers')
          .update(data)
          .eq('id', editingHeader.id);

        if (error) throw error;

        toast({
          title: "Sucesso!",
          description: "Cabeçalho atualizado com sucesso.",
        });
      } else {
        const { error } = await supabase
          .from('exam_headers')
          .insert([data]);

        if (error) throw error;

        toast({
          title: "Sucesso!",
          description: "Cabeçalho criado com sucesso.",
        });
      }

      setDialogOpen(false);
      resetForm();
      fetchHeaders();
    } catch (error) {
      console.error('Erro ao salvar cabeçalho:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar o cabeçalho.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este cabeçalho?')) return;

    try {
      const { error } = await supabase
        .from('exam_headers')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Sucesso!",
        description: "Cabeçalho excluído com sucesso.",
      });

      fetchHeaders();
    } catch (error) {
      console.error('Erro ao excluir cabeçalho:', error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir o cabeçalho.",
        variant: "destructive",
      });
    }
  };

  const handleLogoUpload = (url: string) => {
    setFormData(prev => ({ ...prev, logo_url: url }));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Cabeçalhos de Prova</h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Cabeçalho
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingHeader ? 'Editar Cabeçalho' : 'Novo Cabeçalho'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Nome do Cabeçalho *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex: Cabeçalho UNIUBE"
                  />
                </div>

                <div>
                  <Label htmlFor="institution">Instituição *</Label>
                  <Input
                    id="institution"
                    value={formData.institution}
                    onChange={(e) => setFormData(prev => ({ ...prev, institution: e.target.value }))}
                    placeholder="Ex: Universidade de Uberaba"
                  />
                </div>
              </div>

              <div>
                <Label>Logo da Instituição</Label>
                <FileUpload
                  bucket="exam-logos"
                  allowedTypes={['image/*']}
                  maxSize={5}
                  onUpload={handleLogoUpload}
                  entityType="exam"
                />
                {formData.logo_url && (
                  <div className="mt-2">
                    <img 
                      src={formData.logo_url} 
                      alt="Logo preview" 
                      className="max-h-20 object-contain"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <Label>Informações do Cabeçalho</Label>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">Título</Label>
                    <Input
                      id="title"
                      value={formData.content.title}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        content: { ...prev.content, title: e.target.value }
                      }))}
                      placeholder="Ex: Faculdade de Engenharia"
                    />
                  </div>

                  <div>
                    <Label htmlFor="subtitle">Subtítulo</Label>
                    <Input
                      id="subtitle"
                      value={formData.content.subtitle}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        content: { ...prev.content, subtitle: e.target.value }
                      }))}
                      placeholder="Ex: Curso de Sistemas de Informação"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="address">Endereço</Label>
                  <Textarea
                    id="address"
                    value={formData.content.address}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      content: { ...prev.content, address: e.target.value }
                    }))}
                    placeholder="Endereço completo da instituição"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={formData.content.phone}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        content: { ...prev.content, phone: e.target.value }
                      }))}
                      placeholder="(34) 3333-4444"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      value={formData.content.email}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        content: { ...prev.content, email: e.target.value }
                      }))}
                      placeholder="contato@instituicao.edu.br"
                    />
                  </div>

                  <div>
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      value={formData.content.website}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        content: { ...prev.content, website: e.target.value }
                      }))}
                      placeholder="www.instituicao.edu.br"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={loading}>
                  {loading ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {headers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Building className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              Nenhum cabeçalho criado ainda.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {headers.map((header) => (
            <Card 
              key={header.id}
              className={`cursor-pointer transition-colors ${
                selectedHeaderId === header.id 
                  ? 'border-primary bg-primary/5' 
                  : 'hover:bg-muted/50'
              }`}
              onClick={() => onSelect?.(header)}
            >
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-sm">{header.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {header.institution}
                    </p>
                  </div>
                  <div className="flex space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDialog(header);
                      }}
                    >
                      <Edit className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(header.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {header.logo_url && (
                  <img 
                    src={header.logo_url} 
                    alt="Logo" 
                    className="max-h-8 object-contain mb-2"
                  />
                )}
                {header.content?.title && (
                  <p className="text-xs text-muted-foreground">
                    {header.content.title}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}