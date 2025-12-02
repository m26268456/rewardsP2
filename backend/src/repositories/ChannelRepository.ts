/**
 * 通路 Repository
 * 負責通路相關的資料庫操作
 */
import { Pool } from 'pg';
import { BaseRepository } from './BaseRepository';

export interface ChannelEntity {
  id: string;
  name: string;
  isCommon: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export class ChannelRepository extends BaseRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  /**
   * 取得所有通路
   */
  async findAll(options?: { commonOnly?: boolean }): Promise<ChannelEntity[]> {
    let query = `SELECT id, name, is_common as "isCommon", display_order as "displayOrder",
                        created_at as "createdAt", updated_at as "updatedAt"
                 FROM channels`;
    const params: any[] = [];

    if (options?.commonOnly) {
      query += ' WHERE is_common = true';
    }

    query += ' ORDER BY display_order, name';

    const result = await this.query<ChannelEntity>(query, params);
    return result.rows;
  }

  /**
   * 根據 ID 取得通路
   */
  async findById(id: string): Promise<ChannelEntity | null> {
    const result = await this.query<ChannelEntity>(
      `SELECT id, name, is_common as "isCommon", display_order as "displayOrder",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM channels 
       WHERE id = $1::uuid`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * 根據關鍵字搜尋通路（支援部分匹配和別稱）
   */
  async searchByKeyword(keyword: string): Promise<ChannelEntity[]> {
    const allChannels = await this.findAll();
    const normalizedKeyword = keyword.trim().toLowerCase();
    const matches: Array<ChannelEntity & { matchScore: number }> = [];

    for (const channel of allChannels) {
      const match = this.matchesChannelName(normalizedKeyword, channel.name);
      if (match.matched) {
        let score = 3; // 預設部分匹配
        if (match.isExact) {
          score = match.isAlias ? 1 : 0; // 精確匹配優先
        } else if (match.isAlias) {
          score = 2; // 別稱完整單詞匹配
        }
        matches.push({ ...channel, matchScore: score });
      }
    }

    // 按匹配分數排序
    matches.sort((a, b) => a.matchScore - b.matchScore);
    return matches.map(({ matchScore, ...rest }) => rest);
  }

  /**
   * 解析通路名稱（提取原名稱和別稱）
   */
  private parseChannelName(channelName: string): {
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
   * 檢查關鍵字是否匹配通路名稱
   */
  private matchesChannelName(
    keyword: string,
    channelName: string
  ): { matched: boolean; isExact: boolean; isAlias: boolean } {
    const { baseName, aliases, fullName } = this.parseChannelName(channelName);
    const normalizedKeyword = keyword.toLowerCase();

    // 精確匹配
    if (baseName.toLowerCase() === normalizedKeyword) {
      return { matched: true, isExact: true, isAlias: false };
    }

    // 別稱精確匹配
    for (const alias of aliases) {
      if (alias.toLowerCase() === normalizedKeyword) {
        return { matched: true, isExact: true, isAlias: true };
      }
    }

    // 部分匹配（支援關鍵字在名稱中的任何位置）
    const baseNameLower = baseName.toLowerCase();
    const fullNameLower = fullName.toLowerCase();

    // 檢查關鍵字是否在名稱中（不區分大小寫）
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
   * 新增通路
   */
  async create(data: {
    name: string;
    isCommon?: boolean;
    displayOrder?: number;
  }): Promise<ChannelEntity> {
    // 取得最大 display_order
    const maxOrderResult = await this.query<{ max: number }>(
      'SELECT COALESCE(MAX(display_order), 0) as max FROM channels'
    );
    const maxOrder = maxOrderResult.rows[0]?.max || 0;

    const result = await this.query<ChannelEntity>(
      `INSERT INTO channels (name, is_common, display_order)
       VALUES ($1, $2, $3)
       RETURNING id, name, is_common as "isCommon", display_order as "displayOrder",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [data.name, data.isCommon ?? false, data.displayOrder ?? maxOrder + 1]
    );
    return result.rows[0];
  }

  /**
   * 更新通路
   */
  async update(
    id: string,
    data: {
      name?: string;
      isCommon?: boolean;
      displayOrder?: number;
    }
  ): Promise<ChannelEntity> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }
    if (data.isCommon !== undefined) {
      updates.push(`is_common = $${paramIndex++}`);
      params.push(data.isCommon);
    }
    if (data.displayOrder !== undefined) {
      updates.push(`display_order = $${paramIndex++}`);
      params.push(data.displayOrder);
    }

    if (updates.length === 0) {
      return this.findById(id) as Promise<ChannelEntity>;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const result = await this.query<ChannelEntity>(
      `UPDATE channels 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}::uuid
       RETURNING id, name, is_common as "isCommon", display_order as "displayOrder",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error(`通路 ${id} 不存在`);
    }

    return result.rows[0];
  }

  /**
   * 刪除通路
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.query(
      'DELETE FROM channels WHERE id = $1::uuid RETURNING id',
      [id]
    );
    return result.rows.length > 0;
  }

  /**
   * 批量更新順序
   */
  async updateOrders(orders: Array<{ id: string; displayOrder: number }>): Promise<void> {
    await this.withTransaction(async (client) => {
      for (const order of orders) {
        await client.query(
          'UPDATE channels SET display_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid',
          [order.displayOrder, order.id]
        );
      }
    });
  }
}

