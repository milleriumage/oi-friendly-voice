import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

export const useTrialTimer = (subtractCredits?: (amount: number) => void) => {
  const [trialTimeRemaining, setTrialTimeRemaining] = useState(300); // 5 minutes = 300 seconds
  const [isTrialExpired, setIsTrialExpired] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [hasStartedTimer, setHasStartedTimer] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const minuteCounterRef = useRef<number>(0);

  // Start trial timer only for guest users - not logged in users
  useEffect(() => {
    // Don't start timer for logged in users - they use the 7-day trial
    const isLoggedIn = localStorage.getItem('supabase.auth.token') || 
                      sessionStorage.getItem('supabase.auth.token');
    
    if (isLoggedIn) {
      return; // Skip timer for logged users
    }
    
    if (!hasStartedTimer && !isTrialExpired) {
      setHasStartedTimer(true);
      startTrialTimer();
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [hasStartedTimer, isTrialExpired]);

  const startTrialTimer = () => {
    intervalRef.current = setInterval(() => {
      setTrialTimeRemaining(prev => {
        if (prev <= 1) {
          // Trial expired
          setIsTrialExpired(true);
          setShowLoginModal(true);
          toast.warning('⏰ Tempo de teste esgotado! Faça login para continuar.');
          
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
          return 0;
        }

        // A cada minuto (60 segundos), descontar 4 créditos
        minuteCounterRef.current++;
        if (minuteCounterRef.current >= 60 && subtractCredits) {
          subtractCredits(4);
          minuteCounterRef.current = 0;
        }

        return prev - 1;
      });
    }, 1000);
  };

  const formatTrialTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const checkTrialAction = () => {
    if (isTrialExpired) {
      setShowLoginModal(true);
      toast.error('🔒 Faça login primeiro para usar esta funcionalidade!');
      return false;
    }
    return true;
  };

  const resetTrial = () => {
    setTrialTimeRemaining(300);
    setIsTrialExpired(false);
    setShowLoginModal(false);
    setHasStartedTimer(false);
    minuteCounterRef.current = 0;
  };

  return {
    trialTimeRemaining,
    isTrialExpired,
    showLoginModal,
    setShowLoginModal,
    formatTrialTime,
    checkTrialAction,
    resetTrial
  };
};