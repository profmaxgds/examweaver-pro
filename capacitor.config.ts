import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.4a3777fa375d456f91a71c6483a756c9',
  appName: 'examweaver-pro',
  webDir: 'dist',
  server: {
    url: 'https://4a3777fa-375d-456f-91a7-1c6483a756c9.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    Camera: {
      permissions: ['camera', 'photos']
    }
  }
};

export default config;