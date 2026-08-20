export class ShopLinkResponseDto {
  id: string;
  shopId: string;
  token: string;
  title?: string;
  description?: string;
  source?: string;
  clickCount: number;
  lastClickedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Computed property for full URL
  fullUrl?: string;
}

export class ShopLinkAnalyticsDto {
  id: string;
  token: string;
  title?: string;
  description?: string;
  source?: string;
  clickCount: number;
  lastClickedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Analytics breakdown
  analytics?: {
    totalClicks: number;
    uniqueVisitors?: number;
    topCountries?: Array<{ country: string; visits: number }>;
    topDevices?: Array<{ device: string; visits: number }>;
    topBrowsers?: Array<{ browser: string; visits: number }>;
    clicksByDay?: Array<{ date: string; clicks: number }>;
  };
}
