/**
 * 通路搜尋服務
 * 優化關鍵字搜尋，支援部分匹配並分開顯示結果
 */
import { pool } from '../config/database';
import { queryChannelRewards } from './schemeService';

export interface ChannelMatch {
  id: string;
  name: string;
  baseName: string;
  matchScore: number; // 0=精確匹配, 1=別稱精確匹配, 2=完整單詞匹配, 3=部分匹配
}

export interface ChannelSearchResult {
  channelId: string;
  channelName: string;
  keyword: string;
  results: Array<{
    isExcluded: boolean;
    excludedSchemeName?: string;
    totalRewardPercentage: number;
    rewardBreakdown: string;
    schemeInfo: string;
    requiresSwitch: boolean;
    note?: string;
  }>;
}

/**
 * 解析通路名稱（提取原名稱和別稱）
 */
function parseChannelName(channelName: string): {
  baseName: string;
  aliases: string[];
  fullName: string;
} {
  // 格式：原名稱 (別稱1, 別稱2) 或 原名稱
  const match = channelName.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (match) {
    const baseName = match[1].trim();
    const aliases = match[2].split(',').map((a) => a.trim());
    return { baseName, aliases, fullName: channelName };
  }
  return { baseName: channelName, aliases: [], fullName: channelName };
}

/**
 * 檢查關鍵字是否匹配通路名稱（支援部分匹配）
 */
function matchesChannelName(
  keyword: string,
  channelName: string
): { matched: boolean; isExact: boolean; isAlias: boolean } {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const { baseName, aliases, fullName } = parseChannelName(channelName);

  // 精確匹配（不區分大小寫）
  if (baseName.toLowerCase() === normalizedKeyword) {
    return { matched: true, isExact: true, isAlias: false };
  }

  // 別稱精確匹配
  for (const alias of aliases) {
    if (alias.toLowerCase() === normalizedKeyword) {
      return { matched: true, isExact: true, isAlias: true };
    }
  }

  // 部分匹配（支援關鍵字在名稱中的任何位置，不區分大小寫）
  const baseNameLower = baseName.toLowerCase();
  const fullNameLower = fullName.toLowerCase();

  // 檢查關鍵字是否在名稱中
  if (baseNameLower.includes(normalizedKeyword) || fullNameLower.includes(normalizedKeyword)) {
    return { matched: true, isExact: false, isAlias: false };
  }

  // 檢查別稱中的部分匹配
  for (const alias of aliases) {
    if (alias.toLowerCase().includes(normalizedKeyword)) {
      return { matched: true, isExact: false, isAlias: true };
    }
  }

  return { matched: false, isExact: false, isAlias: false };
}

/**
 * 根據關鍵字查詢通路回饋（優化版：分開顯示每個匹配的通路）
 * 例如搜尋"NET"時，會分別顯示"NET"和"Netflix"的結果
 */
export async function queryChannelRewardsByKeywords(
  keywords: string[]
): Promise<ChannelSearchResult[]> {
  if (keywords.length === 0) return [];

  // 獲取所有通路
  const allChannelsResult = await pool.query(
    `SELECT id, name FROM channels ORDER BY name`
  );

  const allResults: ChannelSearchResult[] = [];

  // 對每個關鍵字進行搜尋
  for (const keyword of keywords) {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const matches: ChannelMatch[] = [];

    // 找出所有匹配的通路
    for (const channel of allChannelsResult.rows) {
      const match = matchesChannelName(normalizedKeyword, channel.name);
      if (match.matched) {
        const { baseName } = parseChannelName(channel.name);
        let score = 3; // 預設部分匹配
        if (match.isExact) {
          score = match.isAlias ? 1 : 0; // 精確匹配優先
        } else if (match.isAlias) {
          score = 2; // 別稱完整單詞匹配
        }
        matches.push({
          id: channel.id,
          name: channel.name,
          baseName,
          matchScore: score,
        });
      }
    }

    // 按匹配分數排序
    matches.sort((a, b) => a.matchScore - b.matchScore);

    // 如果沒有找到匹配的通路，返回空結果但顯示關鍵字
    if (matches.length === 0) {
      allResults.push({
        channelId: '',
        channelName: keyword,
        keyword,
        results: [],
      });
      continue;
    }

    // 為每個匹配的通路分別查詢回饋（分開顯示）
    // 這樣搜尋"NET"時，NET和Netflix會分開顯示
    for (const match of matches) {
      const channelRewards = await queryChannelRewards([match.id]);
      if (channelRewards.length > 0) {
        allResults.push({
          channelId: match.id,
          channelName: match.baseName, // 只顯示原名稱，不顯示別稱
          keyword,
          results: channelRewards[0].results,
        });
      } else {
        // 即使沒有回饋結果，也顯示通路名稱
        allResults.push({
          channelId: match.id,
          channelName: match.baseName,
          keyword,
          results: [],
        });
      }
    }
  }

  return allResults;
}

