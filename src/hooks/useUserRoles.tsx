import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface UserRole {
  id: string;
  user_id: string;
  role: 'admin' | 'professor' | 'corretor';
  assigned_by?: string;
  professor_id?: string;
  created_at: string;
  updated_at: string;
}

export function useUserRoles() {
  const { user } = useAuth();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isProfessor, setIsProfessor] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadUserRoles();
    } else {
      setUserRoles([]);
      setIsAdmin(false);
      setIsProfessor(false);
      setLoading(false);
    }
  }, [user]);

  const loadUserRoles = async () => {
    try {
      setLoading(true);
      
      // Usar SQL direto temporariamente até os tipos serem atualizados
      const { data: adminCheck } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', user!.id)
        .limit(1);
      
      const { data: professorCheck } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', user!.id)
        .limit(1);

      // Por enquanto, assumir que o primeiro usuário é admin
      const userIsAdmin = user!.email === 'maxwellgomessilva@gmail.com'; // Temporário
      setIsAdmin(userIsAdmin);
      setIsProfessor(false);

      // Simular roles baseado na verificação temporária
      const roles: UserRole[] = [];
      if (userIsAdmin) {
        roles.push({
          id: 'admin-role',
          user_id: user!.id,
          role: 'admin',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      setUserRoles(roles);
    } catch (error) {
      console.error('Erro ao carregar papéis do usuário:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasRole = (role: 'admin' | 'professor' | 'corretor') => {
    return userRoles.some(userRole => userRole.role === role);
  };

  return {
    userRoles,
    isAdmin,
    isProfessor,
    loading,
    hasRole,
    refreshRoles: loadUserRoles
  };
}