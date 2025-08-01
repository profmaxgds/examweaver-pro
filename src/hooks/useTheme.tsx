import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

type Theme = 'default' | 'ocean' | 'deep' | 'purple' | 'night';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  themes: { value: Theme; label: string; colors: string[] }[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [theme, setTheme] = useState<Theme>('default');
  const [isLoading, setIsLoading] = useState(true);

  const themes = [
    { 
      value: 'default' as Theme, 
      label: 'Padrão', 
      colors: ['#f8fafc', '#1e293b', '#64748b'] 
    },
    { 
      value: 'ocean' as Theme, 
      label: 'Oceano', 
      colors: ['#6ec2c2', '#40aca4', '#368b96'] 
    },
    { 
      value: 'deep' as Theme, 
      label: 'Profundo', 
      colors: ['#3c5984', '#28225e', '#140d36'] 
    },
    { 
      value: 'purple' as Theme, 
      label: 'Roxo', 
      colors: ['#a19fb5', '#64609c', '#28225e'] 
    },
    { 
      value: 'night' as Theme, 
      label: 'Noturno', 
      colors: ['#140d36', '#28225e', '#6ec2c2'] 
    },
  ];

  // Carregar tema do perfil do usuário ou localStorage
  useEffect(() => {
    const loadUserTheme = async () => {
      setIsLoading(true);
      
      if (user) {
        try {
          // Carregar tema do perfil do usuário
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', user.id)
            .single();
          
          if (!error && profile && (profile as any).theme_preference) {
            const userTheme = (profile as any).theme_preference as Theme;
            if (themes.find(t => t.value === userTheme)) {
              setTheme(userTheme);
              localStorage.setItem('app-theme', userTheme);
            }
          }
        } catch (error) {
          console.error('Erro ao carregar tema do perfil:', error);
          // Fallback para localStorage
          const savedTheme = localStorage.getItem('app-theme') as Theme;
          if (savedTheme && themes.find(t => t.value === savedTheme)) {
            setTheme(savedTheme);
          }
        }
      } else {
        // Usuário não logado, usar localStorage
        const savedTheme = localStorage.getItem('app-theme') as Theme;
        if (savedTheme && themes.find(t => t.value === savedTheme)) {
          setTheme(savedTheme);
        }
      }
      
      setIsLoading(false);
    };

    loadUserTheme();
  }, [user]);

  // Aplicar tema ao DOM e salvar
  useEffect(() => {
    if (isLoading) return; // Não aplicar tema enquanto carrega
    
    const root = document.documentElement;
    
    // Remove all existing theme attributes
    root.removeAttribute('data-theme');
    
    // Apply the selected theme
    if (theme !== 'default') {
      root.setAttribute('data-theme', theme);
    }
    
    // Always save to localStorage
    localStorage.setItem('app-theme', theme);
    
    // Salvar no perfil se usuário estiver logado
    if (user) {
      saveThemeToProfile(theme);
    }
  }, [theme, user, isLoading]);

  const saveThemeToProfile = async (selectedTheme: Theme) => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ theme_preference: selectedTheme } as any)
        .eq('user_id', user.id);
      
      if (error) {
        console.error('Erro ao salvar tema no perfil:', error);
      }
    } catch (error) {
      console.error('Erro ao atualizar tema:', error);
    }
  };

  const value = {
    theme,
    setTheme,
    themes,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme deve ser usado dentro de um ThemeProvider');
  }
  return context;
}