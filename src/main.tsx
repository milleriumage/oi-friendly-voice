import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { LanguageProvider } from "@/hooks/useLanguage.tsx"

// Força novo cache com versão atual
console.log('🚀 Carregando versão: 2025-01-30-02 - Build mais recente!');


createRoot(document.getElementById("root")!).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>
);
