export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export type TransportType = 'CAR' | 'WALK' | 'TRAIN' | 'PLANE' | 'SHIP' | 'BUS';

export interface TripPoint {
  id: string;
  lat: number;
  lng: number;
  locationName: string; // 업체 or 지역명
  address: string;
  date: string; // ISO String
  transportToNext: TransportType; // Method used to get to the NEXT point
  title: string;
  description: string;
  photoUrl: string;
  order: number;
}

export type BgmType = 'YOUTUBE' | 'FILE' | 'NONE';

export interface TripData {
  id?: string;
  userId: string;
  title: string;
  thumbnailUrl?: string; // Representative cover image
  points: TripPoint[];
  bgmUrl?: string;
  bgmType?: BgmType;
  createdAt: number;
  visibility?: 'PUBLIC' | 'PRIVATE';
}

export interface Review {
  id: string;
  tripId: string;
  userId: string;
  userName: string;
  userPhoto: string | null;
  rating: number;
  text: string;
  createdAt: number;
}

// Global declaration for Kakao Maps to avoid TS errors
declare global {
  interface Window {
    kakao: any;
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}