/**
 * 基礎 Repository 類別
 * 提供通用的資料庫操作方法
 */
import { Pool, PoolClient, QueryResult } from 'pg';

export abstract class BaseRepository {
  constructor(protected pool: Pool) {}

  /**
   * 執行查詢
   */
  protected async query<T = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  /**
   * 獲取資料庫連接（用於事務）
   */
  protected async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  /**
   * 開始事務
   */
  protected async beginTransaction(client: PoolClient): Promise<void> {
    await client.query('BEGIN');
  }

  /**
   * 提交事務
   */
  protected async commitTransaction(client: PoolClient): Promise<void> {
    await client.query('COMMIT');
  }

  /**
   * 回滾事務
   */
  protected async rollbackTransaction(client: PoolClient): Promise<void> {
    await client.query('ROLLBACK');
  }

  /**
   * 釋放連接
   */
  protected releaseClient(client: PoolClient): void {
    client.release();
  }

  /**
   * 執行事務操作
   */
  protected async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();
    try {
      await this.beginTransaction(client);
      const result = await callback(client);
      await this.commitTransaction(client);
      return result;
    } catch (error) {
      await this.rollbackTransaction(client);
      throw error;
    } finally {
      this.releaseClient(client);
    }
  }
}

