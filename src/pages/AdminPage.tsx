import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useUserRoles } from '@/hooks/useUserRoles';
import { supabase } from '@/integrations/supabase/client';
import { 
  Users, 
  ArrowLeft, 
  Settings, 
  CreditCard, 
  UserPlus, 
  Ban, 
  Unlock, 
  Trash2, 
  Eye,
  Shield,
  GraduationCap,
  UserCheck,
  Edit2,
  Save,
  X,
  Send,
} from 'lucide-react';

interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  credits: number;
  institution?: string;
  status: 'active' | 'blocked' | 'suspended';
  registration_date: string;
  last_login?: string;
  total_corrections: number;
}

interface UserWithRoles extends Profile {
  roles: Array<{
    id: string;
    role: 'admin' | 'professor' | 'corretor';
    professor_id?: string;
  }>;
  current_credits: number;
}

interface CreditSetting {
  id: string;
  setting_name: string;
  setting_value: number;
  description: string;
}

export default function AdminPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, loading: rolesLoading } = useUserRoles();
  
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [creditSettings, setCreditSettings] = useState<CreditSetting[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
  const [creditAmount, setCreditAmount] = useState<string>('');
  const [creditDescription, setCreditDescription] = useState<string>('');
  const [editingSettings, setEditingSettings] = useState<Record<string, boolean>>({});
  const [tempSettings, setTempSettings] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!rolesLoading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, rolesLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
      loadCreditSettings();
    }
  }, [isAdmin]);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, statusFilter, roleFilter]);

  const loadUsers = async () => {
    try {
      setLoading(true);

      // BUSCA OS USUÁRIOS DIRETAMENTE DA TABELA DE PERFIS, QUE JÁ DEVE CONTER O E-MAIL
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*');
        
      if (profilesError) throw profilesError;

      const usersWithRoles = profilesData.map((profile: any) => {
        const roles = [];
        // Lógica de papéis deve ser implementada aqui
        
        return {
          ...profile,
          current_credits: profile.credits || 0,
          status: profile.status, // Usa o status real do banco de dados
          registration_date: profile.created_at,
          roles,
          email: profile.email // Usa o e-mail da tabela de perfis
        };
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar usuários",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadCreditSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_settings')
        .select('*');

      if (error) throw error;
      
      setCreditSettings(data || []);
    } catch (error) {
      console.error('Erro ao carregar configurações de créditos:', error);
      setCreditSettings([
        { id: '1', setting_name: 'manual_correction_cost', setting_value: 0.10, description: 'Custo em créditos para correção manual' },
        { id: '2', setting_name: 'auto_correction_cost', setting_value: 1.00, description: 'Custo em créditos para correção automática' },
        { id: '3', setting_name: 'initial_credits', setting_value: 30.00, description: 'Créditos iniciais para novos usuários' }
      ]);
    }
  };

  const updateCreditSetting = async (settingName: string, newValue: number) => {
    try {
      const { error } = await supabase
        .from('credit_settings')
        .update({ setting_value: newValue, updated_at: new Date().toISOString() })
        .eq('setting_name', settingName);
      
      if (error) throw error;
      
      setCreditSettings(prev => 
        prev.map(setting => 
          setting.setting_name === settingName 
            ? { ...setting, setting_value: newValue }
            : setting
        )
      );

      toast({
        title: "Configuração atualizada",
        description: "Valor de crédito atualizado com sucesso",
      });
    } catch (error) {
      console.error('Erro ao atualizar configuração:', error);
      toast({
        title: "Erro",
        description: "Erro ao atualizar configuração",
        variant: "destructive",
      });
    }
  };

  const startEditing = (settingName: string, currentValue: number) => {
    setEditingSettings({ ...editingSettings, [settingName]: true });
    setTempSettings({ ...tempSettings, [settingName]: currentValue });
  };

  const saveEdit = (settingName: string) => {
    const newValue = tempSettings[settingName];
    if (newValue !== undefined) {
      updateCreditSetting(settingName, newValue);
    }
    setEditingSettings({ ...editingSettings, [settingName]: false });
  };

  const cancelEdit = (settingName: string) => {
    setEditingSettings({ ...editingSettings, [settingName]: false });
    const newTemp = { ...tempSettings };
    delete newTemp[settingName];
    setTempSettings(newTemp);
  };

  const filterUsers = () => {
    let filtered = users;

    if (searchTerm) {
      filtered = filtered.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.user_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(user => user.status === statusFilter);
    }

    if (roleFilter !== 'all') {
      filtered = filtered.filter(user => 
        user.roles.some(role => role.role === roleFilter)
      );
    }

    setFilteredUsers(filtered);
  };

  const assignRole = async (userId: string, role: 'admin' | 'professor' | 'corretor', professorId?: string) => {
    try {
      toast({
        title: "Funcionalidade em desenvolvimento",
        description: "Atribuição de papéis será implementada em breve",
        variant: "destructive",
      });
    } catch (error) {
      console.error('Erro ao atribuir papel:', error);
      toast({
        title: "Erro",
        description: "Erro ao atribuir papel",
        variant: "destructive",
      });
    }
  };

  const removeRole = async (userId: string, roleId: string) => {
    try {
      toast({
        title: "Funcionalidade em desenvolvimento",
        description: "Remoção de papéis será implementada em breve",
        variant: "destructive",
      });
    } catch (error) {
      console.error('Erro ao remover papel:', error);
      toast({
        title: "Erro",
        description: "Erro ao remover papel",
        variant: "destructive",
      });
    }
  };

  const adjustCredits = async (userId: string, amount: number, description: string) => {
    try {
      const { error: insertError } = await supabase
        .from('credit_transactions')
        .insert({
          user_id: userId,
          amount: amount,
          description: description,
          transaction_type: 'manual_adjustment',
        });
  
      if (insertError) {
        console.error('Erro ao inserir transação:', insertError);
        throw insertError;
      }
  
      const { data: sumData, error: sumError } = await supabase
        .from('credit_transactions')
        .select('amount')
        .eq('user_id', userId);
          
      if (sumError) {
        console.error('Erro ao somar transações:', sumError);
        throw sumError;
      }
  
      const newCredits = sumData.reduce((total, transaction) => total + transaction.amount, 0);
  
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ credits: newCredits })
        .eq('user_id', userId);
  
      if (updateError) {
        console.error('Erro ao atualizar perfil:', updateError);
        throw updateError;
      }
  
      toast({
        title: "Créditos ajustados",
        description: `${amount > 0 ? 'Adicionados' : 'Removidos'} ${Math.abs(amount)} créditos. Saldo atual: ${newCredits}.`,
      });
  
      setUsers(prevUsers => 
        prevUsers.map(u => 
          u.user_id === userId 
            ? { ...u, current_credits: newCredits }
            : u
        )
      );
  
      loadUsers();
      setCreditAmount('');
      setCreditDescription('');
    } catch (error) {
      console.error('Erro geral na função adjustCredits:', error);
      toast({
        title: "Erro",
        description: "Erro ao ajustar créditos",
        variant: "destructive",
      });
    }
  };

  const resendPasswordResetLink = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });

      if (error) throw error;

      toast({
        title: "Link de redefinição enviado",
        description: `Um link de redefinição de senha foi enviado para ${email}.`,
      });
    } catch (error) {
      console.error('Erro ao reenviar link de redefinição de senha:', error);
      toast({
        title: "Erro",
        description: "Não foi possível reenviar o link de redefinição de senha.",
        variant: "destructive",
      });
    }
  };

  const updateUserStatus = async (userId: string, status: 'active' | 'blocked' | 'suspended') => {
    try {
      toast({
        title: "Funcionalidade em desenvolvimento",
        description: "Atualização de status será implementada em breve",
        variant: "destructive",
      });
      loadUsers();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast({
        title: "Erro",
        description: "Erro ao atualizar status do usuário",
        variant: "destructive",
      });
    }
  };

  if (rolesLoading || !isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Shield className="w-4 h-4" />;
      case 'professor': return <GraduationCap className="w-4 h-4" />;
      case 'corretor': return <UserCheck className="w-4 h-4" />;
      default: return <Users className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'blocked': return 'destructive';
      case 'suspended': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Painel Administrativo</h1>
            <p className="text-muted-foreground mt-2">
              Gestão completa de usuários e sistema
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-2">
            <Shield className="w-4 h-4" />
            Administrador
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users">Gestão de Usuários</TabsTrigger>
          <TabsTrigger value="credits">Gestão de Créditos</TabsTrigger>
          <TabsTrigger value="system">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4 items-center flex-wrap">
                <div className="flex-1 min-w-64">
                  <Input
                    placeholder="Buscar por nome, e-mail ou ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="blocked">Bloqueado</SelectItem>
                    <SelectItem value="suspended">Suspenso</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Papéis</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="professor">Professor</SelectItem>
                    <SelectItem value="corretor">Corretor</SelectItem>
                  </SelectContent>
                </Select>

                <Badge variant="outline" className="gap-2">
                  <Users className="w-4 h-4" />
                  {filteredUsers.length} usuários
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usuários do Sistema</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Papéis</TableHead>
                      <TableHead>Créditos</TableHead>
                      <TableHead>Registro</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <p className="font-medium">{user.name}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusColor(user.status)}>
                            {user.status === 'active' && 'Ativo'}
                            {user.status === 'blocked' && 'Bloqueado'}
                            {user.status === 'suspended' && 'Suspenso'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {user.roles.map((role) => (
                              <Badge key={role.id} variant="outline" className="gap-1">
                                {getRoleIcon(role.role)}
                                {role.role}
                              </Badge>
                            ))}
                            {user.roles.length === 0 && (
                              <Badge variant="outline">Usuário comum</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="gap-1">
                            <CreditCard className="w-4 h-4" />
                            {user.current_credits}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(user.registration_date).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedUser(user)}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Gerenciar Usuário: {user.name}</DialogTitle>
                                </DialogHeader>
                                {selectedUser && selectedUser.id === user.id && (
                                  <UserManagementDialog 
                                    user={user}
                                    onAssignRole={assignRole}
                                    onRemoveRole={removeRole}
                                    onUpdateStatus={updateUserStatus}
                                    onAdjustCredits={adjustCredits}
                                    onResendPasswordLink={resendPasswordResetLink}
                                    creditAmount={creditAmount}
                                    setCreditAmount={setCreditAmount}
                                    creditDescription={creditDescription}
                                    setCreditDescription={setCreditDescription}
                                    professors={users.filter(u => u.roles.some(r => r.role === 'professor'))}
                                  />
                                )}
                              </DialogContent>
                            </Dialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credits" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Configurações de Créditos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {creditSettings.map((setting) => (
                  <div key={setting.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <h3 className="font-semibold">
                        {setting.setting_name === 'manual_correction_cost' && 'Correção Manual'}
                        {setting.setting_name === 'auto_correction_cost' && 'Correção Automática'}
                        {setting.setting_name === 'initial_credits' && 'Créditos Iniciais'}
                      </h3>
                      <p className="text-sm text-muted-foreground">{setting.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {editingSettings[setting.setting_name] ? (
                        <>
                          <Input
                            type="number"
                            step="0.01"
                            value={tempSettings[setting.setting_name] || setting.setting_value}
                            onChange={(e) => setTempSettings({
                              ...tempSettings,
                              [setting.setting_name]: parseFloat(e.target.value) || 0
                            })}
                            className="w-24"
                          />
                          <Button
                            size="sm"
                            onClick={() => saveEdit(setting.setting_name)}
                            className="px-2"
                          >
                            <Save className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => cancelEdit(setting.setting_name)}
                            className="px-2"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-2xl font-bold text-primary min-w-16 text-center">
                            {setting.setting_value}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEditing(setting.setting_name, setting.setting_value)}
                            className="px-2"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configurações do Sistema</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Configurações avançadas do sistema em desenvolvimento...
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface UserManagementDialogProps {
  user: UserWithRoles;
  onAssignRole: (userId: string, role: 'admin' | 'professor' | 'corretor', professorId?: string) => void;
  onRemoveRole: (userId: string, roleId: string) => void;
  onUpdateStatus: (userId: string, status: 'active' | 'blocked' | 'suspended') => void;
  onAdjustCredits: (userId: string, amount: number, description: string) => void;
  onResendPasswordLink: (email: string) => void;
  creditAmount: string;
  setCreditAmount: (amount: string) => void;
  creditDescription: string;
  setCreditDescription: (description: string) => void;
  professors: UserWithRoles[];
}

function UserManagementDialog({
  user,
  onAssignRole,
  onRemoveRole,
  onUpdateStatus,
  onAdjustCredits,
  onResendPasswordLink,
  creditAmount,
  setCreditAmount,
  creditDescription,
  setCreditDescription,
  professors
}: UserManagementDialogProps) {
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedProfessor, setSelectedProfessor] = useState<string>('');

  const handleAssignRole = () => {
    if (!selectedRole) return;
    
    const professorId = selectedRole === 'corretor' ? selectedProfessor : undefined;
    onAssignRole(user.user_id, selectedRole as any, professorId);
    setSelectedRole('');
    setSelectedProfessor('');
  };

  const handleAdjustCredits = () => {
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || !creditDescription) return;
    
    onAdjustCredits(user.user_id, amount, creditDescription);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Nome</label>
          <p className="text-sm text-muted-foreground">{user.name}</p>
        </div>
        <div>
          <label className="text-sm font-medium">E-mail</label>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div>
          <label className="text-sm font-medium">Status</label>
          <div className="flex gap-2 mt-1">
            <Button
              size="sm"
              variant={user.status === 'active' ? 'default' : 'outline'}
              onClick={() => onUpdateStatus(user.user_id, 'active')}
            >
              <Unlock className="w-4 h-4 mr-1" />
              Ativo
            </Button>
            <Button
              size="sm"
              variant={user.status === 'blocked' ? 'destructive' : 'outline'}
              onClick={() => onUpdateStatus(user.user_id, 'blocked')}
            >
              <Ban className="w-4 h-4 mr-1" />
              Bloquear
            </Button>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Ações de Conta</label>
          <div className="flex gap-2 mt-1">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => onResendPasswordLink(user.email)}
            >
              <Send className="w-4 h-4 mr-1" />
              Reenviar Link de Senha
            </Button>
          </div>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Papéis Atuais</label>
        <div className="flex gap-2 mt-1 mb-2">
          {user.roles.map((role) => (
            <div key={role.id} className="flex items-center gap-1">
              <Badge variant="outline">{role.role}</Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemoveRole(user.user_id, role.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
        
        <div className="flex gap-2">
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Atribuir papel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Administrador</SelectItem>
              <SelectItem value="professor">Professor</SelectItem>
              <SelectItem value="corretor">Corretor</SelectItem>
            </SelectContent>
          </Select>

          {selectedRole === 'corretor' && (
            <Select value={selectedProfessor} onValueChange={setSelectedProfessor}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Selecionar professor" />
              </SelectTrigger>
              <SelectContent>
                {professors.map((prof) => (
                  <SelectItem key={prof.user_id} value={prof.user_id}>
                    {prof.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button onClick={handleAssignRole} disabled={!selectedRole}>
            <UserPlus className="w-4 h-4 mr-1" />
            Atribuir
          </Button>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Ajustar Créditos (Atual: {user.current_credits})</label>
        <div className="flex gap-2 mt-1">
          <Input
            placeholder="Quantidade (+/-)"
            value={creditAmount}
            onChange={(e) => setCreditAmount(e.target.value)}
            type="number"
            step="0.01"
          />
          <Input
            placeholder="Descrição"
            value={creditDescription}
            onChange={(e) => setCreditDescription(e.target.value)}
          />
          <Button onClick={handleAdjustCredits} disabled={!creditAmount || !creditDescription}>
            <CreditCard className="w-4 h-4 mr-1" />
            Ajustar
          </Button>
        </div>
      </div>
    </div>
  );
}