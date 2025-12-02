/**
 * 卡片 Repository
 * 負責卡片相關的資料庫操作
 */
import { Pool } from 'pg';
import { BaseRepository } from './BaseRepository';

export interface CardEntity {
  id: string;
  name: string;
  note?: string;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export class CardRepository extends BaseRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  /**
   * 取得所有卡片
   */
  async findAll(): Promise<CardEntity[]> {
    const result = await this.query<CardEntity>(
      `SELECT id, name, note, display_order as "displayOrder", 
              created_at as "createdAt", updated_at as "updatedAt"
       FROM cards 
       ORDER BY display_order, created_at`
    );
    return result.rows;
  }

  /**
   * 根據 ID 取得卡片
   */
  async findById(id: string): Promise<CardEntity | null> {
    const result = await this.query<CardEntity>(
      `SELECT id, name, note, display_order as "displayOrder",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM cards 
       WHERE id = $1::uuid`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * 新增卡片
   */
  async create(data: {
    name: string;
    note?: string | null;
    displayOrder?: number;
  }): Promise<CardEntity> {
    // 取得最大 display_order
    const maxOrderResult = await this.query<{ max: number }>(
      'SELECT COALESCE(MAX(display_order), 0) as max FROM cards'
    );
    const maxOrder = maxOrderResult.rows[0]?.max || 0;

    const result = await this.query<CardEntity>(
      `INSERT INTO cards (name, note, display_order)
       VALUES ($1, $2, $3)
       RETURNING id, name, note, display_order as "displayOrder",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [data.name, data.note || null, data.displayOrder ?? maxOrder + 1]
    );
    return result.rows[0];
  }

  /**
   * 更新卡片
   */
  async update(
    id: string,
    data: {
      name?: string;
      note?: string | null;
      displayOrder?: number;
    }
  ): Promise<CardEntity> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }
    if (data.note !== undefined) {
      updates.push(`note = $${paramIndex++}`);
      params.push(data.note);
    }
    if (data.displayOrder !== undefined) {
      updates.push(`display_order = $${paramIndex++}`);
      params.push(data.displayOrder);
    }

    if (updates.length === 0) {
      return this.findById(id) as Promise<CardEntity>;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const result = await this.query<CardEntity>(
      `UPDATE cards 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}::uuid
       RETURNING id, name, note, display_order as "displayOrder",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error(`卡片 ${id} 不存在`);
    }

    return result.rows[0];
  }

  /**
   * 刪除卡片
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.query(
      'DELETE FROM cards WHERE id = $1::uuid RETURNING id',
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
          'UPDATE cards SET display_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid',
          [order.displayOrder, order.id]
        );
      }
    });
  }
}

