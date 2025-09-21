import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useGuestData } from './useGuestData';

export interface Follower {
  id: string;
  follower_id: string;
  created_at: string;
  follower_profile?: {
    display_name: string | null;
    avatar_url: string | null;
    user_id: string;
  } | null;
}

export const useFollowers = (creatorId?: string) => {
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { guestData } = useGuestData();

  // Carregar status de seguimento e contagem
  useEffect(() => {
    if (!creatorId) return;

    const loadFollowData = async () => {
      try {
        // Contar seguidores
        const { data: countData } = await supabase
          .rpc('get_followers_count', { creator_uuid: creatorId });
        
        setFollowersCount(countData || 0);

        // Contar quantas pessoas o criador está seguindo
        const { count: followingCountData } = await supabase
          .from('followers')
          .select('*', { count: 'exact', head: true })
          .eq('follower_id', creatorId);
        
        console.log('Following count for creator', creatorId, ':', followingCountData);
        setFollowingCount(followingCountData || 0);

        // Verificar se usuário atual está seguindo
        const { data: { user } } = await supabase.auth.getUser();
        const followerId = user?.id || guestData.sessionId;
        
        if (followerId) {
          const { data: followData } = await supabase
            .from('followers')
            .select('id')
            .eq('creator_id', creatorId)
            .eq('follower_id', followerId)
            .maybeSingle();

          setIsFollowing(!!followData);
        }
      } catch (error) {
        console.error('Error loading follow data:', error);
      }
    };

    loadFollowData();

    // Set up real-time subscription for followers changes
    const followersChannel = supabase
      .channel('followers-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'followers',
          filter: `creator_id=eq.${creatorId}`
        },
        () => {
          // Reload follow data when followers change
          loadFollowData();
        }
      )
      .subscribe();

    // Set up real-time subscription for following changes (when creator follows someone)
    const followingChannel = supabase
      .channel('following-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'followers',
          filter: `follower_id=eq.${creatorId}`
        },
        () => {
          // Reload follow data when following changes
          loadFollowData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(followersChannel);
      supabase.removeChannel(followingChannel);
    };
  }, [creatorId]);

  // Carregar lista completa de seguidores
  const loadFollowers = async () => {
    if (!creatorId) return;

    setIsLoading(true);
    try {
      // Buscar seguidores com perfis de usuários logados
      const { data, error } = await supabase
        .rpc('get_followers_with_profiles', { creator_uuid: creatorId });

      if (error) throw error;

      // Buscar também seguidores visitantes da tabela followers
      const { data: allFollowers, error: followersError } = await supabase
        .from('followers')
        .select('follower_id, created_at')
        .eq('creator_id', creatorId);

      if (followersError) throw followersError;

      // Buscar perfis de visitantes da nova tabela guest_profiles
      const { data: guestProfiles, error: guestError } = await supabase
        .from('guest_profiles')
        .select('session_id, display_name, avatar_url');

      if (guestError) throw guestError;

      // Combinar dados
      const followersData = (allFollowers || []).map(follower => {
        // Verificar se é usuário logado
        const userProfile = (data || []).find(p => p.follower_id === follower.follower_id);
        
        if (userProfile) {
          return {
            id: `${creatorId}-${follower.follower_id}`,
            follower_id: follower.follower_id,
            created_at: follower.created_at,
            follower_profile: {
              display_name: userProfile.display_name,
              avatar_url: userProfile.avatar_url,
              user_id: follower.follower_id
            }
          };
        } else {
          // Verificar se é visitante na tabela guest_profiles
          const guestProfile = (guestProfiles || []).find(g => g.session_id === follower.follower_id);
          
          return {
            id: `${creatorId}-${follower.follower_id}`,
            follower_id: follower.follower_id,
            created_at: follower.created_at,
            follower_profile: {
              display_name: guestProfile?.display_name || 'Visitante',
              avatar_url: guestProfile?.avatar_url || null,
              user_id: follower.follower_id
            }
          };
        }
      });

      setFollowers(followersData);
    } catch (error) {
      console.error('Error loading followers:', error);
      toast.error('Erro ao carregar seguidores');
    } finally {
      setIsLoading(false);
    }
  };

  // Carregar lista de quem o criador está seguindo
  const loadFollowing = async () => {
    if (!creatorId) return;
    
    console.log('Loading following for creator:', creatorId);
    setIsLoading(true);
    try {
      // Buscar quem o criador está seguindo - buscar perfis de usuários logados
      const { data: followingData, error } = await supabase
        .from('followers')
        .select(`
          id,
          creator_id,
          created_at
        `)
        .eq('follower_id', creatorId);

      if (error) throw error;

      // Para cada seguidor, buscar o perfil atualizado
      const followingWithProfiles = await Promise.all(
        (followingData || []).map(async (follow) => {
          console.log('Looking for profile of creator_id:', follow.creator_id);
          
          // Primeiro buscar perfil do usuário logado
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('user_id', follow.creator_id)
            .maybeSingle();

          console.log('Profile found:', profile, 'Error:', profileError);

          // Se não encontrou perfil de usuário, buscar na tabela guest_profiles
          let guestProfile = null;
          if (!profile) {
            const { data: guest, error: guestError } = await supabase
              .from('guest_profiles')
              .select('display_name, avatar_url')
              .eq('session_id', follow.creator_id)
              .maybeSingle();
            
            console.log('Guest profile found:', guest, 'Error:', guestError);
            guestProfile = guest;
          }

          const finalProfile = {
            display_name: profile?.display_name || guestProfile?.display_name || 'Usuário',
            avatar_url: profile?.avatar_url || guestProfile?.avatar_url || null
          };

          console.log('Final profile for', follow.creator_id, ':', finalProfile);

          return {
            id: follow.id,
            creator_id: follow.creator_id,
            created_at: follow.created_at,
            creator_profile: finalProfile
          };
        })
      );

      console.log('Following loaded:', followingWithProfiles);
      setFollowing(followingWithProfiles);
    } catch (error) {
      console.error('Error loading following:', error);
      toast.error('Erro ao carregar seguindo');
    } finally {
      setIsLoading(false);
    }
  };

  // Seguir/Desseguir criador
  const toggleFollow = async () => {
    if (!creatorId) return;

    const { data: { user } } = await supabase.auth.getUser();
    const followerId = user?.id || guestData.sessionId;
    
    if (!followerId) {
      toast.error('Erro ao identificar usuário');
      return;
    }

    try {
      if (isFollowing) {
        // Desseguir
        const { error } = await supabase
          .from('followers')
          .delete()
          .eq('creator_id', creatorId)
          .eq('follower_id', followerId);

        if (error) throw error;

        setIsFollowing(false);
        setFollowersCount(prev => Math.max(0, prev - 1));
        
        toast.success('Você parou de seguir este criador');
        
        toast.success('Você parou de seguir este criador');
      } else {
        // Seguir
        const { error } = await supabase
          .from('followers')
          .insert({
            creator_id: creatorId,
            follower_id: followerId
          });

        if (error) throw error;

        // Se é um visitante, salvar dados do perfil na nova tabela
        if (!user?.id && guestData.sessionId) {
          await supabase
            .from('guest_profiles')
            .upsert({
              session_id: guestData.sessionId,
              display_name: guestData.displayName || 'Visitante',
              avatar_url: guestData.avatarUrl || null
            });
        }

        setIsFollowing(true);
        setFollowersCount(prev => prev + 1);
        
        toast.success('Agora você está seguindo este criador!');
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      toast.error('Erro ao processar ação');
    }
  };

  return {
    isFollowing,
    followersCount,
    followingCount,
    followers,
    following,
    isLoading,
    toggleFollow,
    loadFollowers,
    loadFollowing
  };
};