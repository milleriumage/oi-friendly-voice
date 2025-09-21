﻿import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Crown, DollarSign, Lock, Unlock, Eye, EyeOff, Share2, ArrowLeft, Settings } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams, useParams } from "react-router-dom";
import { useCreatorMessages } from "@/hooks/useCreatorMessages";
import { useUserCredits } from "@/hooks/useUserCredits";
import { useSubscription } from "@/hooks/useSubscription";
import { useVisibilitySettings } from "@/hooks/useVisibilitySettings";
// Logo removida - usando nova logo inline
import { EnhancedChat } from "@/components/EnhancedChat";
import { MediaShowcase } from "@/components/MediaShowcase";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { UserFloatingDialog } from "@/components/UserFloatingDialog";
import { AddCreditsDialog } from "@/components/AddCreditsDialog";
import { PremiumPlansManager } from "@/components/PremiumPlansManager";
import { CreditSuccessNotification } from "@/components/CreditSuccessNotification";
import { SubscriptionSuccessNotification } from "@/components/SubscriptionSuccessNotification";
import { ActivePlanIndicator } from "@/components/ActivePlanIndicator";
import { getMediaUrl } from "@/lib/mediaUtils";
import { fixMediaPolicies } from "@/utils/fixMediaPolicies";
import { useCreatorPermissions } from "@/hooks/useCreatorPermissions";
import { SocialMediaIcons } from "@/components/SocialMediaIcons";
import { useCreatorSocialIcons } from "@/hooks/useCreatorSocialIcons";
import { PagePausedMessage } from "@/components/PagePausedMessage";
import { FollowButton } from "@/components/FollowButton";
import { FollowersCounter } from "@/components/FollowersCounter";
import { useFollowers } from "@/hooks/useFollowers";
import { useCreatorWishlist } from "@/hooks/useCreatorWishlist";
const UserView = () => {
  const {
    creatorId: rawCreatorId
  } = useParams<{
    creatorId: string;
  }>();
  // Map "default" to template user ID - evitar conflito com dados guest
  const creatorId = rawCreatorId === 'default' ? '509bdca7-b48f-47ab-8150-261585a125c2' : rawCreatorId;
  const isViewingCreatorPage = !!creatorId;
  const {
    messages,
    sendMessage
  } = useCreatorMessages(creatorId);
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const {
    credits,
    isLoading: creditsLoading,
    addCredits,
    isLoggedIn
  } = useUserCredits();
  const {
    subscribed,
    subscription_tier,
    checkSubscription
  } = useSubscription();
  const {
    settings: visibilitySettings
  } = useVisibilitySettings(creatorId);
  const {
    isCreator,
    canEdit
  } = useCreatorPermissions(creatorId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [creatorProfile, setCreatorProfile] = useState<any>(null);
  const [showPremiumDialog, setShowPremiumDialog] = useState(false);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [showAddCreditsDialog, setShowAddCreditsDialog] = useState(false);
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);
  const [addedCredits, setAddedCredits] = useState(0);
  const [showSubscriptionSuccess, setShowSubscriptionSuccess] = useState(false);
  const [subscribedPlan, setSubscribedPlan] = useState('');
  const [isPagePrivate, setIsPagePrivate] = useState(false);
  const [pageVisibilityLoading, setPageVisibilityLoading] = useState(true);
  
  // Social media icons - usar o creatorId para buscar os dados do criador da pÃ¡gina
  const { socialNetworks, updateSocialNetwork, addSocialNetwork, deleteSocialNetwork, isLoading } = useCreatorSocialIcons(creatorId);
  
  // Sistema de seguidores
  const { isFollowing, followersCount, toggleFollow } = useFollowers(creatorId);

  // Carregar wishlist do criador para visitantes
  const { wishlistItems: creatorWishlistItems } = useCreatorWishlist(creatorId);

  // Carregar dados do criador e suas mÃ­dias
  useEffect(() => {
    const loadCreatorData = async () => {
      if (!creatorId || !isViewingCreatorPage) {
        console.log('ðŸš« DEBUG: No valid creatorId provided for UserView', {
          creatorId,
          isViewingCreatorPage
        });
        return;
      }
      console.log('ðŸ“Š DEBUG: Loading creator data for:', creatorId);
      try {
        // Verificar status de autenticaÃ§Ã£o
        const {
          data: {
            user
          }
        } = await supabase.auth.getUser();
        console.log('ðŸ‘¤ DEBUG: Current user auth status:', {
          isLoggedIn: !!user,
          userId: user?.id
        });

        // Carregar perfil do criador
        console.log('ðŸ” DEBUG: Fetching creator profile...');
        const {
          data: profileData,
          error: profileError
        } = await supabase.from('profiles').select('*').eq('user_id', creatorId).single();
        if (profileError) {
          console.error('âŒ DEBUG: Error loading creator profile:', profileError);
          console.log('ðŸ” DEBUG: Profile error details:', {
            code: profileError.code,
            message: profileError.message,
            details: profileError.details
          });
          toast.error('âŒ Criador nÃ£o encontrado');
          return;
        }
        console.log('âœ… DEBUG: Creator profile loaded:', profileData);
        setCreatorProfile(profileData);

        // Check if page is private (only for non-creators)
        if (!isCreator) {
          const settings = (profileData?.settings as any) || {};
          const pagePublic = settings.pagePublic !== false; // Default to true
          setIsPagePrivate(!pagePublic);
          
          if (!pagePublic) {
            setPageVisibilityLoading(false);
            return; // Don't load media if page is private
          }
        }

        // Carregar mÃ­dias do criador
        console.log('ðŸŽ¬ DEBUG: Fetching creator media items...');
        const {
          data: mediaData,
          error: mediaError
        } = await supabase.from('media_items').select('*').eq('user_id', creatorId).order('created_at', {
          ascending: false
        });
        if (mediaError) {
          console.error('âŒ DEBUG: Error loading creator media:', mediaError);
          console.log('ðŸ” DEBUG: Media error details:', {
            code: mediaError.code,
            message: mediaError.message,
            details: mediaError.details,
            hint: mediaError.hint
          });

          // Verificar se Ã© erro de RLS
          if (mediaError.code === '42501' || mediaError.message?.includes('policy')) {
            console.log('ðŸš« DEBUG: RLS policy blocking media access for anonymous users');
            toast.error('âŒ Acesso Ã s mÃ­dias bloqueado por polÃ­tica de seguranÃ§a');
          } else {
            toast.error('âŒ Erro ao carregar mÃ­dias do criador');
          }
          setMediaItems([]); // Garantir que nÃ£o fique com dados antigos
        } else {
          console.log('âœ… DEBUG: Media items loaded:', {
            count: mediaData?.length || 0,
            items: mediaData?.map(item => ({
              id: item.id,
              type: item.type,
              is_main: item.is_main,
              storage_path: item.storage_path?.substring(0, 50) + '...'
            }))
          });
          setMediaItems(mediaData || []);
        }
      } catch (error) {
        console.error('ðŸ’¥ DEBUG: Unexpected error loading creator data:', error);
        toast.error('âŒ Erro ao carregar dados do criador');
      } finally {
        setPageVisibilityLoading(false);
      }
    };
    loadCreatorData();
  }, [creatorId, isViewingCreatorPage, isCreator]);

  // Verificar se veio de pagamento bem-sucedido
  useEffect(() => {
    const paymentSuccess = searchParams.get('payment_success');
    const creditsParam = searchParams.get('credits');
    const subscriptionSuccess = searchParams.get('subscription_success');
    const planParam = searchParams.get('plan');
    if (paymentSuccess === 'true' && creditsParam) {
      const creditsAmount = parseInt(creditsParam);
      setAddedCredits(creditsAmount);
      setShowSuccessNotification(true);
      addCredits(creditsAmount);

      // Limpar parÃ¢metros da URL
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('payment_success');
      newSearchParams.delete('credits');
      setSearchParams(newSearchParams, {
        replace: true
      });
    }
    if (subscriptionSuccess === 'true' && planParam) {
      setSubscribedPlan(planParam);
      setShowSubscriptionSuccess(true);
      checkSubscription(); // Refresh subscription status

      // Limpar parÃ¢metros da URL
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('subscription_success');
      newSearchParams.delete('plan');
      setSearchParams(newSearchParams, {
        replace: true
      });

      // Auto-hide notification after 30 seconds
      setTimeout(() => {
        setShowSubscriptionSuccess(false);
      }, 30000);
    }
  }, [searchParams, setSearchParams, addCredits, checkSubscription]);

  // Estados para planos premium com produtos do Stripe
  const [premiumPlans] = useState([{
    id: 'basic',
    title: 'Basic',
    price: '$9.99/month',
    description: ['â€¢ Unlimited chat', 'â€¢ Basic content access'],
    link: '',
    stripeProductId: 'prod_SkHR3k5moylM8t'
  }, {
    id: 'pro',
    title: 'Pro',
    price: '$19.99/month',
    description: ['â€¢ Everything in Basic', 'â€¢ Exclusive content', 'â€¢ VIP interaction'],
    link: '',
    stripeProductId: 'prod_SkHY1XdCaL1NZY'
  }, {
    id: 'vip',
    title: 'VIP',
    price: '$39.99/month',
    description: ['â€¢ Everything in Pro', 'â€¢ Full access', 'â€¢ Private chat'],
    link: '',
    stripeProductId: 'prod_SkHcmX6aKWG7yi'
  }]);
  const streamerImage = "/lovable-uploads/7503b55d-e8fe-47c3-9366-ca734fd0c867.png";
  const handlePlanClick = (planName: string) => {
    window.open("https://www.google.com", "_blank");
  };
  const handleShare = async () => {
    if (!rawCreatorId) return;
    const shareUrl = `${window.location.origin}/user/${rawCreatorId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("ðŸ”— Link copiado para a Ã¡rea de transferÃªncia!");
    } catch {
      if ((navigator as any).share) {
        try {
          await (navigator as any).share({
            url: shareUrl,
            title: "AuraLink"
          });
          return;
        } catch {}
      }
      toast.error("âŒ NÃ£o foi possÃ­vel copiar o link");
    }
  };
  const mainMedia = mediaItems.find(item => item.is_main) || {
    storage_path: streamerImage,
    is_blurred: false,
    price: "",
    type: 'image' as const
  };
  const mainMediaUrl = React.useMemo(() => getMediaUrl(mainMedia.storage_path), [mainMedia.storage_path]);
  const handleMediaClick = (item: any) => {
    if (item.link) {
      window.open(item.link, '_blank');
    } else if (item.is_blurred || item.price) {
      toast.info("ðŸ”’ ConteÃºdo premium! Assine para ter acesso.");
    }
  };
  // Show loading or private page message
  if (pageVisibilityLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-secondary to-background p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando pÃ¡gina...</p>
        </div>
      </div>
    );
  }

  if (isPagePrivate && !isCreator) {
    return <PagePausedMessage />;
  }

  return <div className="min-h-screen bg-gradient-to-br from-secondary to-background p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        
        {/* Header simplificado para usuÃ¡rios */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center w-full gap-4 sm:gap-2">
          
          {/* Controles da esquerda - apenas premium e crÃ©ditos (baseado nas configuraÃ§Ãµes de visibilidade) */}
          <div className="flex flex-col items-start gap-2 sm:flex-shrink-0">
            <div className="flex items-center gap-2">
              {visibilitySettings.showPremiumDialog && <Dialog open={showPremiumDialog} onOpenChange={setShowPremiumDialog}>
                  <DialogTrigger asChild>
                    <Button className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-full px-6 py-2">
                      <Crown className="w-4 h-4 mr-2" />
                      BE PREMIUM
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <PremiumPlansManager plans={premiumPlans} onPlansUpdate={() => {}} // UsuÃ¡rios nÃ£o podem editar
                disabled={true} // Sempre desabilitado para usuÃ¡rios
                isUserView={true} // Habilita funcionalidade de checkout
                />
                  </DialogContent>
                </Dialog>}

              <Button onClick={handleShare} className="rounded-full px-6 py-2" variant="secondary">
                <Share2 className="w-4 h-4 mr-2" />
                Compartilhar
              </Button>


              
            </div>
            
            {/* Indicador de plano ativo */}
            {subscribed && subscription_tier && <ActivePlanIndicator planTier={subscription_tier} />}

            {/* Indicador de que estÃ¡ visitando o perfil de um criador */}
            {creatorProfile && isViewingCreatorPage && <div className="flex items-center gap-2">
                
                
                <Button onClick={() => window.history.back()} size="sm" variant="outline" className="h-8 px-3 text-base">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              </div>}

            {/* Indicador de debug para desenvolvimento */}
            {import.meta.env.DEV}
          </div>

          {/* Logo centralizado */}
          <div className="flex items-center justify-center sm:flex-1 sm:mx-4">
            <div className="flex flex-col items-center gap-1">
              <div className="text-center">
                <h1 className="text-xl sm:text-2xl font-bold font-sans tracking-wide">
                  <span className="bg-gradient-to-r from-orange-400 via-pink-500 to-purple-600 bg-clip-text text-transparent">Social</span>
                  <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent ml-2">Link</span>
                </h1>
                <p className="text-sm text-muted-foreground">For Influencers, Creators & Sellers</p>
              </div>
            </div>
          </div>

          {/* Controles da direita - seguidores e auth */}
          <div className="flex items-center justify-end gap-2 sm:flex-shrink-0">
            {/* Contador de seguidores */}
            <FollowersCounter 
              creatorId={creatorId} 
              showForCreator={isCreator}
            />
            
            {/* BotÃ£o de seguir (apenas para visitantes) */}
            {!isCreator && creatorId && (
              <FollowButton
                isFollowing={isFollowing}
                onToggleFollow={toggleFollow}
              />
            )}
            
            <GoogleAuthButton onLoginSuccess={() => setShowUserDialog(true)} />
          </div>
        </div>

        {/* MÃ­dia principal - usuÃ¡rios podem ver mas com restriÃ§Ãµes */}
        {visibilitySettings.showMainMediaDisplay && (
          <div className="relative">
            {mainMedia.type === 'video' ? <video src={mainMediaUrl} controls className={`w-full max-h-80 md:max-h-96 lg:max-h-[500px] object-contain rounded-lg cursor-pointer ${mainMedia.is_blurred ? 'blur-md' : ''}`} onClick={() => handleMediaClick(mainMedia)} title={(mainMedia as any).description || "Main display"} /> : <img src={mainMediaUrl} alt="Streamer" className={`w-full max-h-80 md:max-h-96 lg:max-h-[500px] object-contain rounded-lg cursor-pointer ${mainMedia.is_blurred ? 'blur-md' : ''}`} onClick={() => handleMediaClick(mainMedia)} title={(mainMedia as any).description || "Main display"} />}
            {mainMedia.is_blurred && mainMedia.price && <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-foreground/70 text-background font-bold px-4 py-2 rounded-lg text-lg">
                  ðŸ”’ Buy Now {mainMedia.price}
                </div>
              </div>}
          </div>
        )}

        {/* Showcase de mÃ­dia - controlado pelas configuraÃ§Ãµes de visibilidade */}
        {(() => {
        if (import.meta.env.DEV) console.log('ðŸ‘ï¸ DEBUG: Media showcase visibility check:', {
          showVitrine: visibilitySettings.showVitrine,
          showMediaToVisitors: visibilitySettings.showMediaToVisitors,
          mediaItemsCount: mediaItems.length,
          hasCreatorProfile: !!creatorProfile
        });
        return visibilitySettings.showVitrine ? <MediaShowcase mediaItems={mediaItems} onUploadImage={canEdit ? () => toast.info("ðŸ”’ Funcionalidade nÃ£o implementada para visitantes!") : () => toast.info("ðŸ”’ Apenas o criador pode fazer upload!")} onUploadVideo={canEdit ? () => toast.info("ðŸ”’ Funcionalidade nÃ£o implementada para visitantes!") : () => toast.info("ðŸ”’ Apenas o criador pode fazer upload!")} onReplaceMedia={canEdit ? () => toast.info("ðŸ”’ Funcionalidade nÃ£o implementada para visitantes!") : () => toast.info("ðŸ”’ Apenas o criador pode editar!")} onUpdateMedia={() => {}} onDeleteMedia={canEdit ? () => toast.info("ðŸ”’ Funcionalidade nÃ£o implementada para visitantes!") : () => toast.info("ðŸ”’ Apenas o criador pode deletar!")} onSetAsMain={canEdit ? () => toast.info("ðŸ”’ Funcionalidade nÃ£o implementada para visitantes!") : () => toast.info("ðŸ”’ Apenas o criador pode editar!")} onEditMedia={canEdit ? () => toast.info("ðŸ”’ Funcionalidade nÃ£o implementada para visitantes!") : () => toast.info("ðŸ”’ Apenas o criador pode editar!")} onSetPrice={canEdit ? () => toast.info("ðŸ”’ Funcionalidade nÃ£o implementada para visitantes!") : () => toast.info("ðŸ”’ Apenas o criador pode editar!")} onSetLink={canEdit ? () => toast.info("ðŸ”’ Funcionalidade nÃ£o implementada para visitantes!") : () => toast.info("ðŸ”’ Apenas o criador pode editar!")} passwordProtected={false} onPasswordVerify={() => {}} credits={isLoggedIn ? credits : 0} onAddCredits={addCredits} onSubtractCredits={async () => {
          if (!canEdit) {
            toast.info("ðŸ”’ Apenas o criador pode usar crÃ©ditos!");
            return false;
          }
          toast.info("ðŸ”’ Funcionalidade nÃ£o implementada para visitantes!");
          return false;
        }} visibilitySettings={{
          showUploadButtons: visibilitySettings.showUploadButtons,
          showEditIcons: visibilitySettings.showEditIcons,
          showMediaActions: visibilitySettings.showMediaActions,
          showVitrine: visibilitySettings.showVitrine,
          showMediaInteractionStats: visibilitySettings.showMediaInteractionStats,
          showVitrineBackgroundEdit: visibilitySettings.showVitrineBackgroundEdit
        }} creatorId={creatorId} /> : <Card className="p-6 text-center">
              <div className="space-y-2">
                <EyeOff className="w-8 h-8 mx-auto text-muted-foreground" />
                <h3 className="font-medium text-muted-foreground">Vitrine de MÃ­dia Oculta</h3>
                <p className="text-sm text-muted-foreground">
                  O criador optou por manter a vitrine privada para visitantes.
                </p>
              </div>
            </Card>;
      })()}

        <Card className="p-4 bg-card border">
          <div className="flex flex-col items-center mb-4">
            {/* Ãcones de redes sociais - removido seÃ§Ã£o duplicada, jÃ¡ incluÃ­do no MediaShowcase */}
          </div>
          
          {/* Chat para usuÃ¡rios - ediÃ§Ã£o controlada pelas configuraÃ§Ãµes de visibilidade */}
          {visibilitySettings.showChat && (
            <EnhancedChat 
              messages={messages} 
              onSendMessage={sendMessage} 
              onEditMessage={() => toast.info("ðŸ”’ Apenas criadores podem editar mensagens!")} 
              passwordProtected={false} 
              onPasswordVerify={() => {}} 
              creatorId={creatorId}
              visibilitySettings={{
                showChatEditing: visibilitySettings.showChatEditing,
                showChatCloseIcon: visibilitySettings.showChatCloseIcon
              }} 
            />
          )}
        </Card>

        <UserFloatingDialog isOpen={showUserDialog} onClose={() => setShowUserDialog(false)} />

        <AddCreditsDialog open={showAddCreditsDialog} onOpenChange={setShowAddCreditsDialog} />

        {showSuccessNotification && <CreditSuccessNotification credits={addedCredits} onClose={() => setShowSuccessNotification(false)} />}

        {showSubscriptionSuccess && <SubscriptionSuccessNotification planName={subscribedPlan} onClose={() => setShowSubscriptionSuccess(false)} />}


      </div>
    </div>;
};
export default UserView;

