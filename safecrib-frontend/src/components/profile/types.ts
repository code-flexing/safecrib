export interface ProfileVM {
  isOwner: boolean;
  isFollowing: boolean;
  followsYou: boolean;
  isAgent: boolean;
  whatsapp?: string | null;
  phone?: string | null;
}
