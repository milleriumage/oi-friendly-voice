import { useState, useEffect } from 'react';
import { useGoogleAuth } from './useGoogleAuth';
import { toast } from 'sonner';
import { useNotifications } from './useNotifications';
import { supabase } from '@/integrations/supabase/client';
import { validateCredits, validateProfileData } from '@/utils/dataValidation';
import { SecureSessionManager, RateLimiter } from '@/utils/securityUtils';

export const useUserCredits = () => {
  const [credits, setCredits] = useState(40); // Iniciar com 40 créditos para guest
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useGoogleAuth();
  const { createNotification } = useNotifications();

  // Buscar créditos do usuário quando ele faz login
  useEffect(() => {
    const fetchUserCredits = async () => {
      if (!user) {
        // Para usuários não logados (guest), usar dados do guest com validação
        const guestData = localStorage.getItem('dreamlink_guest_data');
        if (guestData) {
          try {
            const parsed = JSON.parse(guestData);
            const validation = validateCredits(parsed.credits);
            setCredits(validation.data || 40);
          } catch {
            setCredits(40);
          }
        } else {
          setCredits(40);
        }
        return;
      }

      // Verificar rate limiting para evitar spam de requests
      if (!RateLimiter.check(`fetch_credits_${user.id}`, 10, 60000)) {
        console.warn('⚠️ Rate limit atingido para busca de créditos');
        return;
      }

      setIsLoading(true);
      try {
        // Verificar se está no modo Ryan (teste)
        const isRyanMode = localStorage.getItem('ryan_test_credits');
        if (isRyanMode) {
          const validation = validateCredits(localStorage.getItem('ryan_test_credits'));
          const ryanCredits = validation.data || 160;
          setCredits(ryanCredits);
          console.log(`[RYAN MODE] Créditos validados e carregados: ${ryanCredits}`);
        } else {
          // Usuário logado normal - buscar do banco de dados
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('credits')
            .eq('user_id', user.id)
            .single();
          
          if (error) {
            console.error('Erro ao buscar créditos do perfil:', error);
            // Manter valor atual para evitar exploração
          } else {
            const validation = validateProfileData(profile);
            setCredits(validation.data?.credits || 0);
            
            if (!validation.isValid) {
              console.warn('Dados de perfil inválidos:', validation.error);
            }
          }
        }
        
        // Atualizar atividade da sessão
        SecureSessionManager.updateActivity();
        
      } catch (error) {
        console.error('Erro ao buscar créditos:', error);
        // Manter valor atual para evitar exploração
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserCredits();
  }, [user]);

  const addCredits = async (amount: number) => {
    const newTotal = credits + amount;
    console.log(`[CREDITS] Adicionando ${amount} créditos: ${credits} → ${newTotal}`);
    
    setCredits(newTotal);
    
    // Salvar no localStorage ou banco
    if (user) {
      // Verificar se está no modo Ryan
      const isRyanMode = localStorage.getItem('ryan_test_credits');
      if (isRyanMode) {
        localStorage.setItem('ryan_test_credits', newTotal.toString());
        console.log(`[RYAN MODE] Créditos atualizados: ${newTotal}`);
      } else {
        // Atualizar no banco de dados para usuários logados
        const { error } = await supabase
          .from('profiles')
          .update({ credits: newTotal })
          .eq('user_id', user.id);
        
        if (error) {
          console.error('Erro ao atualizar créditos no banco:', error);
          // Reverter o estado local se houver erro no banco
          setCredits(credits);
        } else {
          console.log(`[CREDITS] Créditos atualizados no banco com sucesso: ${newTotal}`);
        }
      }
    } else {
      // Modo guest: atualizar dados do guest
      const guestData = localStorage.getItem('dreamlink_guest_data');
      if (guestData) {
        try {
          const parsed = JSON.parse(guestData);
          parsed.credits = newTotal;
          localStorage.setItem('dreamlink_guest_data', JSON.stringify(parsed));
        } catch {
          localStorage.setItem('dreamlink_guest_data', JSON.stringify({
            notifications: [],
            credits: newTotal
          }));
        }
      } else {
        localStorage.setItem('dreamlink_guest_data', JSON.stringify({
          notifications: [],
          credits: newTotal
        }));
      }
    }
  };

  const subtractCredits = async (amount: number, action: string = 'Ação realizada') => {
    console.log(`[CREDITS] Tentando deduzir ${amount} créditos. Saldo atual: ${credits}`);
    
    // Validar entrada
    const validation = validateCredits(amount);
    if (!validation.isValid) {
      toast.error(`Valor inválido: ${validation.error}`);
      return false;
    }
    
    const validAmount = validation.data!;
    
    if (credits < validAmount) {
      toast.error(`Créditos insuficientes! Você tem ${credits} créditos, mas precisa de ${validAmount}.`);
      return false;
    }
    
    // Rate limiting para operações que deduzem créditos
    const rateLimitKey = user ? `subtract_${user.id}` : `subtract_guest_${Date.now()}`;
    if (!RateLimiter.check(rateLimitKey, 20, 60000)) {
      toast.error('⚠️ Muitas operações em pouco tempo. Aguarde um momento.');
      return false;
    }
    
    const newTotal = Math.max(0, credits - validAmount);
    
    // Força atualização do estado
    setCredits(prevCredits => {
      console.log(`[CREDITS] Atualizando estado: ${prevCredits} → ${newTotal}`);
      return newTotal;
    });
    
    console.log(`[CREDITS] Novo saldo após dedução: ${newTotal}`);
    
    // Salvar no localStorage ou banco de dados
    if (user) {
      // Verificar se está no modo Ryan
      const isRyanMode = localStorage.getItem('ryan_test_credits');
      if (isRyanMode) {
        const ryanValidation = validateCredits(newTotal);
        if (ryanValidation.isValid) {
          localStorage.setItem('ryan_test_credits', newTotal.toString());
          console.log(`[RYAN MODE] Créditos após dedução: ${newTotal}`);
        }
      } else {
        // Atualizar no banco de dados para usuários logados
        const { error } = await supabase
          .from('profiles')
          .update({ credits: newTotal })
          .eq('user_id', user.id);
        
        if (error) {
          console.error('Erro ao atualizar créditos no banco:', error);
          // Reverter o estado local se houver erro no banco
          setCredits(credits);
          toast.error('❌ Erro ao salvar créditos. Operação revertida.');
          return false;
        } else {
          console.log(`[CREDITS] Créditos atualizados no banco: ${newTotal}`);
        }
      }
    } else {
      // Modo guest: atualizar dados do guest com validação
      const guestData = localStorage.getItem('dreamlink_guest_data');
      if (guestData) {
        try {
          const parsed = JSON.parse(guestData);
          parsed.credits = newTotal;
          localStorage.setItem('dreamlink_guest_data', JSON.stringify(parsed));
          console.log(`[CREDITS] Salvando créditos guest validados: ${newTotal}`);
        } catch {
          localStorage.setItem('dreamlink_guest_data', JSON.stringify({
            notifications: [],
            credits: newTotal
          }));
        }
      } else {
        localStorage.setItem('dreamlink_guest_data', JSON.stringify({
          notifications: [],
          credits: newTotal
        }));
      }
    }

    // Criar notificação
    await createNotification(
      'credit_deduction',
      'Créditos Descontados',
      `${action} - ${validAmount} crédito${validAmount > 1 ? 's' : ''} descontado${validAmount > 1 ? 's' : ''}`,
      validAmount
    );

    // Se os créditos expiraram, mostrar mensagem de login
    if (newTotal === 0) {
      toast.error('🔒 Seus créditos expiraram! Faça login para continuar usando o app.');
    }
    
    return true;
  };

  return {
    credits,
    isLoading,
    addCredits,
    subtractCredits,
    hasCredits: credits > 0,
    isLoggedIn: !!user
  };
};