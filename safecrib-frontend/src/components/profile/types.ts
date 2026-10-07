export type ProfileVM = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  verified?: boolean;
  affiliation?: string | null;
  badgeLabel?: string | null;
  bio?: string | null;
  stats: {
    posts?: number;
    views?: number;
    following?: number;
    followers?: number;
  };
  isOwner: boolean;
  isFollowing?: boolean;
  followsYou?: boolean;
  isAgent?: boolean;
  phone?: string | null;
  whatsapp?: string | null;
  avatarVersion?: string | null;
};

type RawProfile = {
  id: string;
  username?: string | null;
  displayName?: string;
  name?: string;
  profilePicture?: string | null;
  coverPicture?: string | null;
  isVerified?: boolean;
  schoolOfStudy?: string | null;
  businessName?: string | null;
  agencyName?: string | null;
  location?: string | null;
  badgeLabel?: string | null;
  verificationBadge?: string | null;
  shortBio?: string | null;
  longBio?: string | null;
  description?: string | null;
  postsCount?: number;
  listings?: Array<unknown>;
  viewsCount?: number;
  publicEngagement?: { likeCount: number } | null;
  followingCount?: number;
  followerCount?: number;
  providerPageFollowerCount?: number;
  isFollowingUser?: boolean;
  followsYou?: boolean;
  role?: string;
  providerPageId?: string | null;
  phoneNumber?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  avatarVersion?: string | null;
};

export function toProfileVM(raw: RawProfile, viewerId?: string | null): ProfileVM {
  return {
    id: raw.id,
    username: raw.username ?? "",
    displayName: raw.displayName ?? raw.name ?? raw.username ?? "",
    avatarUrl: raw.profilePicture,
    coverUrl: raw.coverPicture,
    verified: raw.isVerified,
    affiliation: raw.schoolOfStudy ?? raw.businessName ?? raw.agencyName ?? raw.location,
    badgeLabel: raw.badgeLabel ?? raw.verificationBadge,
    bio: raw.shortBio ?? raw.longBio ?? raw.description,
    stats: {
      posts: raw.postsCount ?? raw.listings?.length,
      views: raw.viewsCount ?? raw.publicEngagement?.likeCount,
      following: raw.followingCount,
      followers: raw.followerCount ?? raw.providerPageFollowerCount,
    },
    isOwner: !!viewerId && viewerId === raw.id,
    isFollowing: raw.isFollowingUser,
    followsYou: raw.followsYou,
    isAgent: raw.role === "AGENT" || raw.role === "LANDLORD" || raw.providerPageId !== null,
    phone: raw.phoneNumber ?? raw.phone,
    whatsapp: raw.whatsapp,
    avatarVersion: raw.avatarVersion ?? raw.profilePicture,
  };
}