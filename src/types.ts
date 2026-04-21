export type Category = '上装' | '下装' | '连衣裙' | '鞋子' | '包包' | '配饰';

export interface WardrobeItem {
  id: string;
  imageUrl: string; 
  name: string;
  category: Category;
  color: string;
  styleTags: string[];
  createdAt: number;
}

export interface OutfitRecommendation {
  id: string;
  title: string;
  description: string;
  itemIds: string[]; // references WardrobeItem.id
  scenario: string;
  createdAt: number;
}
