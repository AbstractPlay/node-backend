export type UserSettings = {
  [k: string]: any;
  all?: {
    [k: string]: any;
    annotate?: boolean;
    notifications?: {
      gameStart: boolean;
      gameEnd: boolean;
      challenges: boolean;
      yourturn: boolean;
      tournamentStart: boolean;
      tournamentEnd: boolean;
    };
    inAppNotifications?: {
      challenges: boolean;
      gameStart: boolean;
      gameEnd: boolean;
      ratingChange: boolean;
      eventInvitation: boolean;
      completedGameChat: boolean;
      tournamentStart: boolean;
      tournamentEnd: boolean;
    };
  };
};

export type UserLastSeen = {
  id: string;
  name: string;
  lastSeen?: number;
};

export type User = {
  id: string;
  name: string;
  time?: number;
  settings?: UserSettings;
  draw?: string;
};

export type UsersData = {
  id: string;
  name: string;
  country: string;
  lastSeen: number;
  stars: string[];
  bggid?: string;
  avatarStyle?: string;
  avatarSeed?: string;
  bot: boolean;
  admin?: boolean;
};

export type PartialClaims = {
  sub: string;
  email: string;
  email_verified: boolean;
};
