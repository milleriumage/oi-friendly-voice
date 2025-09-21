import React, { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';

interface ChatOverlayButtonProps {
  onToggle?: (isOpen: boolean) => void;
  className?: string;
}

export const ChatOverlayButton: React.FC<ChatOverlayButtonProps> = ({ 
  onToggle,
  className = ""
}) => {
  const [showChatOverlay, setShowChatOverlay] = useState(false);

  const handleToggle = () => {
    const newState = !showChatOverlay;
    setShowChatOverlay(newState);
    onToggle?.(newState);
    
    // Show notification when button is created/activated
    if (newState) {
      toast({
        title: "Botão criado",
        description: "Chat overlay ativado com sucesso",
        duration: 3000,
      });
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={handleToggle}
            className={`
              fixed bottom-6 right-6 z-50 
              h-14 w-14 rounded-full p-0 
              bg-gradient-to-r from-primary to-primary/80 
              hover:from-primary/90 hover:to-primary/70
              shadow-lg hover:shadow-xl 
              transition-all duration-300 
              hover:scale-105 active:scale-95
              md:bottom-8 md:right-8 md:h-16 md:w-16
              ${showChatOverlay ? 'ring-2 ring-primary/50 ring-offset-2' : ''}
              ${className}
            `}
            size="icon"
            aria-label="Toggle chat overlay"
          >
            <MessageCircle 
              className={`
                h-6 w-6 md:h-7 md:w-7 
                transition-transform duration-200
                ${showChatOverlay ? 'scale-110' : ''}
              `} 
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>
          <p>{showChatOverlay ? 'Fechar chat' : 'Abrir chat'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};