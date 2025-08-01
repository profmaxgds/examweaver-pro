// src/pages/ProfilePage.tsx

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, User, CreditCard, Lock, Eye, EyeOff, CheckCircle, Palette } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Profile {
  id: string;
  user_id: string;
  name: string;
  institution: string | null;
  subjects: string[] | null;
  credits: number;
  total_corrections: number;
  created_at: string;
  updated_at: string;
}

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme, themes } = useTheme();
  
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  
  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subjects, setSubjects] = useState('');
  
  // Password change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProfile();
      setEmail(user.email || '');
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (error) throw error;
      
      setProfile(data);
      setName(data.name || '');
      setSubjects(data.subjects?.join(', ') || '');
    } catch (error) {
      console.error('Erro ao buscar perfil:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar o perfil.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user || !profile) return;
    
    setUpdating(true);
    try {
      // Atualizar perfil
      const subjectsArray = subjects
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          name,
          subjects: subjectsArray.length > 0 ? subjectsArray : null,
        })
        .eq('user_id', user.id);
      
      if (profileError) throw profileError;
      
      // Atualizar email se mudou
      if (email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: email,
        });
        
        if (emailError) throw emailError;
        
        toast({
          title: "Email atualizado!",
          description: "Verifique seu novo email para confirmar a alteração.",
        });
      }
      
      toast({
        title: "Sucesso!",
        description: "Perfil atualizado com sucesso.",
      });
      
      await fetchProfile();
    } catch (error: any) {
      console.error('Erro ao atualizar perfil:', error);
      toast({
        title: "Erro",
        description: `Não foi possível atualizar o perfil: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user) return;
    
    if (newPassword !== confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem.",
        variant: "destructive",
      });
      return;
    }
    
    if (newPassword.length < 6) {
      toast({
        title: "Erro",
        description: "A nova senha deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }
    
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      
      if (error) throw error;
      
      toast({
        title: "Sucesso!",
        description: "Senha alterada com sucesso.",
      });
      
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Erro ao alterar senha:', error);
      toast({
        title: "Erro",
        description: `Não foi possível alterar a senha: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando perfil...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Home
                </Button>
              </Link>
              <h1 className="text-2xl font-bold">Meu Perfil</h1>
            </div>
            <Button variant="outline" onClick={handleSignOut}>
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Card de Créditos */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Créditos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">
                  {profile?.credits || 0}
                </div>
                <p className="text-sm text-muted-foreground">créditos disponíveis</p>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Correções realizadas:</span>
                  <span className="font-medium">{profile?.total_corrections || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Membro desde:</span>
                  <span className="font-medium">
                    {profile?.created_at 
                      ? new Date(profile.created_at).toLocaleDateString('pt-BR')
                      : 'N/A'
                    }
                  </span>
                </div>
              </div>
              
              <Button className="w-full" disabled>
                Comprar Créditos
                <span className="text-xs ml-2">(Em breve)</span>
              </Button>
            </CardContent>
          </Card>

          {/* Formulário de Dados */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Dados do Professor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="profile" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="profile">Dados Pessoais</TabsTrigger>
                  <TabsTrigger value="theme">Tema</TabsTrigger>
                  <TabsTrigger value="password">Alterar Senha</TabsTrigger>
                </TabsList>
                
                <TabsContent value="profile" className="space-y-4 mt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Nome Completo *</Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Seu nome completo"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="subjects">Disciplinas</Label>
                    <Input
                      id="subjects"
                      value={subjects}
                      onChange={(e) => setSubjects(e.target.value)}
                      placeholder="Matemática, Física, Química (separadas por vírgula)"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Separe as disciplinas por vírgula
                    </p>
                  </div>
                  
                  <Button 
                    onClick={handleUpdateProfile} 
                    disabled={updating}
                    className="w-full"
                  >
                    {updating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                        Atualizando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Salvar Alterações
                      </>
                    )}
                  </Button>
                </TabsContent>
                
                <TabsContent value="theme" className="space-y-4 mt-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Palette className="w-5 h-5" />
                      <h3 className="text-lg font-semibold">Escolha o Tema</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {themes.map((themeOption) => (
                        <div
                          key={themeOption.value}
                          className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
                            theme === themeOption.value
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          }`}
                          onClick={() => {
                            setTheme(themeOption.value);
                            toast({
                              title: "Tema alterado!",
                              description: `Tema "${themeOption.label}" aplicado com sucesso.`,
                            });
                          }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-medium">{themeOption.label}</span>
                            {theme === themeOption.value && (
                              <CheckCircle className="w-5 h-5 text-primary" />
                            )}
                          </div>
                          
                          <div className="flex gap-2">
                            {themeOption.colors.map((color, index) => (
                              <div
                                key={index}
                                className="w-8 h-8 rounded-full border border-border"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="text-sm text-muted-foreground">
                      <p>O tema será aplicado imediatamente em todo o aplicativo.</p>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="password" className="space-y-4 mt-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="currentPassword">Senha Atual</Label>
                      <div className="relative">
                        <Input
                          id="currentPassword"
                          type={showCurrentPassword ? "text" : "password"}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Digite sua senha atual"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        >
                          {showCurrentPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="newPassword">Nova Senha</Label>
                      <div className="relative">
                        <Input
                          id="newPassword"
                          type={showNewPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Digite sua nova senha (mín. 6 caracteres)"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                        >
                          {showNewPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                      <div className="relative">
                        <Input
                          id="confirmPassword"
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirme sua nova senha"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    
                    <Button 
                      onClick={handleChangePassword} 
                      disabled={changingPassword || !newPassword || !confirmPassword}
                      className="w-full"
                    >
                      {changingPassword ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                          Alterando...
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 mr-2" />
                          Alterar Senha
                        </>
                      )}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}