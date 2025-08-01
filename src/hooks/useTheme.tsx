import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'default' | 'ocean' | 'deep' | 'purple' | 'night';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  themes: { value: Theme; label: string; colors: string[] }[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('default');

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

  useEffect(() => {
    const savedTheme = localStorage.getItem('app-theme') as Theme;
    if (savedTheme && themes.find(t => t.value === savedTheme)) {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    
    // Remove all existing theme attributes
    root.removeAttribute('data-theme');
    
    // Apply the selected theme
    if (theme !== 'default') {
      root.setAttribute('data-theme', theme);
    }
    
    // Always save to localStorage
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  // Load theme on mount and when user logs in
  useEffect(() => {
    const loadSavedTheme = () => {
      const savedTheme = localStorage.getItem('app-theme') as Theme;
      if (savedTheme && themes.find(t => t.value === savedTheme)) {
        setTheme(savedTheme);
      }
    };

    loadSavedTheme();
    
    // Listen for storage changes (useful for multi-tab scenarios)
    window.addEventListener('storage', loadSavedTheme);
    
    return () => {
      window.removeEventListener('storage', loadSavedTheme);
    };
  }, []);

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