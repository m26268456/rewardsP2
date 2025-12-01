import { Pool, PoolClient } from 'pg';
import { NotFoundError, ValidationError } from '../utils/errors';

/**
 * 交易服務
 * 提取交易相關的業務邏輯
 */
export class TransactionService {
  constructor(private pool: Pool) {}

  /**
   * 驗證方案和支付方式 ID
   */
  async validateTransactionInput(
    schemeId: string | null,
    paymentMethodId: string | null,
    client: PoolClient
  ): Promise<{ validSchemeId: string | null; validPaymentMethodId: string | null }> {
    let validSchemeId: string | null = null;
    let validPaymentMethodId: string | null = null;

    // 如果只有 paymentMethodId（純支付方式），不需要 schemeId
    if (paymentMethodId && !schemeId) {
      const paymentCheck = await client.query(
        'SELECT id FROM payment_methods WHERE id = $1',
        [paymentMethodId]
      );
      if (paymentCheck.rows.length === 0) {
        throw new NotFoundError('支付方式');
      }
      validPaymentMethodId = paymentMethodId;
    } else if (schemeId) {
      // 有 schemeId 的情況（可能同時有 paymentMethodId）
      const schemeCheck = await client.query(
        'SELECT id FROM card_schemes WHERE id = $1',
        [schemeId]
      );
      if (schemeCheck.rows.length === 0) {
        throw new NotFoundError('方案');
      }
      validSchemeId = schemeId;

      // 如果同時提供了 paymentMethodId，驗證它是否存在
      if (paymentMethodId) {
        const paymentCheck = await client.query(
          'SELECT id FROM payment_methods WHERE id = $1',
          [paymentMethodId]
        );
        if (paymentCheck.rows.length === 0) {
          throw new NotFoundError('支付方式');
        }
        validPaymentMethodId = paymentMethodId;
      }
    } else {
      throw new ValidationError('必須提供方案 ID 或支付方式 ID');
    }

    return { validSchemeId, validPaymentMethodId };
  }
}

