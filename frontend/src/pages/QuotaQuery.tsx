import { useEffect, useState } from 'react';
import api from '../utils/api';

interface QuotaInfo {
  schemeId: string | null;
  paymentMethodId: string | null;
  name: string;
  rewardComposition: string;
  calculationMethods: string[];
  quotaLimits: Array<number | null>;
  currentAmounts: number[];
  usedQuotas: number[];
  remainingQuotas: Array<number | null>;
  referenceAmounts: Array<number | null>;
  refreshTimes: string[];
  rewardIds: string[];
  quotaRefreshTypes?: Array<string | null>;
  quotaRefreshValues?: Array<number | null>;
  quotaRefreshDates?: Array<string | null>;
  cardId?: string | null;
  paymentMethodIdForGroup?: string | null;
  cardName?: string | null;
  paymentMethodName?: string | null;
  schemeName?: string | null;
  sharedRewardGroupId?: string | null;
  __index?: number;
  [key: string]: unknown;
}

const bindingPalette = [
  { rowBg: 'bg-green-50', border: 'border-green-200', badgeBg: 'bg-green-200', badgeText: 'text-green-900' },
  { rowBg: 'bg-yellow-50', border: 'border-yellow-200', badgeBg: 'bg-yellow-200', badgeText: 'text-yellow-900' },
  { rowBg: 'bg-purple-50', border: 'border-purple-200', badgeBg: 'bg-purple-200', badgeText: 'text-purple-900' },
  { rowBg: 'bg-pink-50', border: 'border-pink-200', badgeBg: 'bg-pink-200', badgeText: 'text-pink-900' },
  { rowBg: 'bg-teal-50', border: 'border-teal-200', badgeBg: 'bg-teal-200', badgeText: 'text-teal-900' },
];

export default function QuotaQuery() {
  const [quotas, setQuotas] = useState<QuotaInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [expandedPayments, setExpandedPayments] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadQuotas();
    const interval = setInterval(loadQuotas, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadQuotas = async () => {
    try {
      setLoading(true);
      const res = await api.get('/quota');
      if (!res.data?.success || !Array.isArray(res.data.data)) {
        setQuotas([]);
        return;
      }

      const processed = res.data.data.map((quota: QuotaInfo & { shared_reward_group_id?: string | null }, index: number) => {
        if (!quota.schemeId && quota.paymentMethodId) {
          if (
            (!quota.rewardIds || quota.rewardIds.length === 0 || quota.rewardIds.every(id => !id || id.trim() === '')) &&
            quota.rewardComposition?.trim()
          ) {
            const count = quota.rewardComposition.split('/').length;
            quota.rewardIds = Array(count).fill('');
          }
        }
        return {
          ...quota,
          sharedRewardGroupId: quota.sharedRewardGroupId ?? quota.shared_reward_group_id ?? null,
          __index: index,
        };
      });
      setQuotas(processed);
    } catch (error) {
      console.error('載入額度錯誤:', error);
      alert('載入額度失敗: ' + ((error as { response?: { data?: { error?: string } } }).response?.data?.error ?? (error as Error).message));
      setQuotas([]);
    } finally {
      setLoading(false);
    }
  };

  const cardQuotas = quotas.filter(q => q.schemeId && !q.paymentMethodId);
  const paymentQuotas = quotas.filter(q => !q.schemeId && q.paymentMethodId);

  const cardGroups = new Map<string, QuotaInfo[]>();
  cardQuotas.forEach(quota => {
    if (!quota.cardId) {
      console.warn('額度資料缺少 cardId（已跳過）:', quota);
      return;
    }
    if (!cardGroups.has(quota.cardId)) {
      cardGroups.set(quota.cardId, []);
    }
    cardGroups.get(quota.cardId)!.push(quota);
  });

  const paymentGroups = new Map<string, QuotaInfo[]>();
  paymentQuotas.forEach(quota => {
    const key = quota.paymentMethodIdForGroup || quota.paymentMethodId || 'unknown';
    if (!paymentGroups.has(key)) {
      paymentGroups.set(key, []);
    }
    paymentGroups.get(key)!.push(quota);
  });

  const schemeNameMap = new Map<string, string>();
  quotas.forEach(q => {
    if (q.schemeId) {
      schemeNameMap.set(q.schemeId, q.schemeName || q.name);
    }
  });

  const bindingGroups = new Map<string, Set<string>>();
  cardQuotas.forEach(quota => {
    const rootId = quota.sharedRewardGroupId || quota.schemeId || null;
    if (!rootId || !quota.schemeId) return;
    if (!bindingGroups.has(rootId)) {
      bindingGroups.set(rootId, new Set());
    }
    bindingGroups.get(rootId)!.add(quota.schemeId);
  });

  const bindingColorMap = new Map<string, typeof bindingPalette[number]>();
  let paletteIndex = 0;
  bindingGroups.forEach((members, rootId) => {
    if (members.size > 1) {
      bindingColorMap.set(rootId, bindingPalette[paletteIndex % bindingPalette.length]);
      paletteIndex += 1;
    }
  });

  const formatQuotaInfo = (used: number, remaining: number | null, limit: number | null) => {
    const usedStr = used.toLocaleString();
    const remainingStr = remaining === null ? '無上限' : remaining.toLocaleString();
    const limitStr = limit === null ? '無上限' : limit.toLocaleString();
    return (
      <div className="space-y-1">
        <div className="text-xs text-gray-600">
          <span className="font-medium">已用：</span>
          <span className={used > 0 ? 'text-orange-600' : 'text-gray-500'}>{usedStr}</span>
        </div>
        <div className="text-xs text-gray-600">
          <span className="font-medium">剩餘：</span>
          <span className={remaining !== null && remaining < (limit || 0) * 0.2 ? 'text-red-600 font-semibold' : 'text-green-600'}>
            {remainingStr}
          </span>
        </div>
        <div className="text-xs text-gray-500">
          <span className="font-medium">上限：</span>
          {limitStr}
        </div>
      </div>
    );
  };

  const formatConsumptionInfo = (current: number, reference: number | null) => {
    const currentStr = current.toLocaleString();
    const referenceStr = reference === null ? '無上限' : Math.round(reference).toLocaleString();
    return (
      <div className="space-y-1">
        <div className="text-xs text-gray-600">
          <span className="font-medium">消費：</span>
          <span className={current > 0 ? 'text-blue-600' : 'text-gray-500'}>{currentStr}</span>
        </div>
        <div className="text-xs text-gray-600">
          <span className="font-medium">參考：</span>
          <span className="text-purple-600">{referenceStr}</span>
        </div>
      </div>
    );
  };

  const renderQuotaTable = (
    quotaList: QuotaInfo[],
    groupKey: string,
    options?: { groupType: 'card' | 'payment'; cardId?: string; paymentId?: string }
  ) => {
    if (quotaList.length === 0) return null;

    const isCardGroup = options?.groupType === 'card';

    const tableRows = quotaList.flatMap((quota, localIndex) => {
      const quotaIndex = typeof quota.__index === 'number' ? quota.__index : localIndex;
      const bindingRootId =
        quota.schemeId && isCardGroup ? quota.sharedRewardGroupId || quota.schemeId : null;
      const isBindingChild =
        Boolean(bindingRootId) &&
        quota.sharedRewardGroupId &&
        quota.schemeId !== bindingRootId;

      if (isCardGroup && isBindingChild) {
        return [];
      }

      const bindingMembers =
        isCardGroup && bindingRootId
          ? quotaList.filter(member => {
              if (!member.schemeId) return false;
              const root = member.sharedRewardGroupId || member.schemeId;
              return root === bindingRootId;
            })
          : [];

      const displayNameQuotas = bindingMembers.length > 0 ? bindingMembers : [quota];

      let validRewardIndices: number[] = [];
      if (quota.rewardIds?.length) {
        validRewardIndices = quota.rewardIds.map((_id, idx) => idx);
      } else if (quota.rewardComposition?.trim()) {
        const count = quota.rewardComposition.split('/').length;
        validRewardIndices = Array.from({ length: count }, (_, idx) => idx);
      } else {
        validRewardIndices = [0];
      }

      const rewardCount = validRewardIndices.length;
      const bindingColors = bindingRootId ? bindingColorMap.get(bindingRootId) : undefined;
      const defaultBg = quotaIndex % 2 === 0 ? 'bg-white' : 'bg-blue-50';
      const defaultBorder = quotaIndex % 2 === 0 ? 'border-gray-200' : 'border-blue-200';
      const rowBgClass = bindingColors?.rowBg ?? defaultBg;
      const borderColor = bindingColors?.border ?? defaultBorder;

      return validRewardIndices.map((originalIndex, displayIndex) => {
        const isFirstRow = displayIndex === 0;
        const rewardPercentage = quota.rewardComposition?.split('/')[originalIndex]?.replace('%', '') || '';
        const calculationMethod = quota.calculationMethods?.[originalIndex] || 'round';
        const calculationMethodText =
          calculationMethod === 'round'
            ? '四捨五入'
            : calculationMethod === 'floor'
              ? '無條件捨去'
              : '無條件進位';

        const usedQuota = quota.usedQuotas?.[originalIndex] || 0;
        const remainingQuota = quota.remainingQuotas?.[originalIndex] ?? null;
        const quotaLimit = quota.quotaLimits?.[originalIndex] ?? null;
        const currentAmount = quota.currentAmounts?.[originalIndex] || 0;
        const referenceAmount = quota.referenceAmounts?.[originalIndex] ?? null;

        return (
          <tr
            key={`${groupKey}-${quotaIndex}-${originalIndex}`}
            className={`${rowBgClass} ${borderColor} border-l-4 hover:bg-blue-100 transition-colors`}
          >
            {isFirstRow && (
              <td
                className={`px-4 py-3 text-sm font-medium sticky left-0 ${rowBgClass} z-10 border-r border-gray-200`}
                rowSpan={rewardCount}
              >
                <div className="space-y-1">
                  {displayNameQuotas.map(member => (
                    <div key={member.schemeId || member.name} className="flex items-center gap-1">
                      <span className="font-semibold text-gray-900">
                        {member.schemeName || member.name}
                      </span>
                      {bindingMembers.length > 1 && member.schemeId === bindingRootId && (
                        <span className="text-[10px] text-gray-500">(來源)</span>
                      )}
                    </div>
                  ))}
                </div>
                {(bindingMembers.length > 1 || quota.sharedRewardGroupId) && (
                  <div
                    className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                      bindingColors ? `${bindingColors.badgeBg} ${bindingColors.badgeText}` : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    共同回饋綁定
                    {bindingMembers.length > 1 ? (
                      <span>（共 {bindingMembers.length} 個方案）</span>
                    ) : (
                      quota.sharedRewardGroupId && (
                        <span>（來源：{schemeNameMap.get(quota.sharedRewardGroupId) || '共享方案'}）</span>
                      )
                    )}
                  </div>
                )}
              </td>
            )}
            <td className="px-4 py-3 text-sm">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                {rewardPercentage || '-'}%
              </span>
            </td>
            <td className="px-4 py-3 text-sm text-gray-600">
              {calculationMethodText}
            </td>
            <td className="px-4 py-3 text-sm">
              {formatQuotaInfo(usedQuota, remainingQuota, quotaLimit)}
            </td>
            <td className="px-4 py-3 text-sm">
              {formatConsumptionInfo(currentAmount, referenceAmount)}
            </td>
            <td className="px-4 py-3 text-sm text-gray-600">
              <div className="text-xs">{quota.refreshTimes?.[originalIndex] || '-'}</div>
            </td>
          </tr>
        );
      });
    });

    return (
      <div className="border-t border-gray-200 p-4">
        <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 250px)' }}>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider sticky left-0 bg-gradient-to-r from-gray-50 to-gray-100 z-30 border-r border-gray-200">
                  名稱
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  回饋組成
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  計算方式
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[140px]">
                  額度狀態
                  <div className="text-[10px] font-normal text-gray-500 mt-1">已用/剩餘/上限</div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[120px]">
                  消費資訊
                  <div className="text-[10px] font-normal text-gray-500 mt-1">消費/參考餘額</div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  刷新時間
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">{tableRows}</tbody>
          </table>
        </div>
      </div>
    );
  };

  const toggleCard = (cardId: string) => {
    const next = new Set(expandedCards);
    if (next.has(cardId)) {
      next.delete(cardId);
    } else {
      next.add(cardId);
    }
    setExpandedCards(next);
  };

  const togglePayment = (paymentId: string) => {
    const next = new Set(expandedPayments);
    if (next.has(paymentId)) {
      next.delete(paymentId);
    } else {
      next.add(paymentId);
    }
    setExpandedPayments(next);
  };

  const hasAnyQuota = cardQuotas.length > 0 || paymentQuotas.length > 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
          額度查詢
        </h2>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600" />
          <span className="ml-3 text-gray-600">載入中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
        額度查詢
      </h2>

      {!hasAnyQuota && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">目前沒有任何額度資料。請先新增卡片方案或支付方式並設定回饋組成。</p>
        </div>
      )}

      {cardGroups.size > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4 text-gray-800">信用卡</h3>
          <div className="space-y-2">
            {Array.from(cardGroups.entries()).map(([cardId, group]) => {
              const cardName = group[0]?.cardName || cardId;
              const isExpanded = expandedCards.has(cardId);
              return (
                <div key={cardId} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => toggleCard(cardId)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <span className="font-medium text-gray-900">{cardName}</span>
                    <span className="text-gray-500">{isExpanded ? '▼' : '▶'}</span>
                  </button>
                  {isExpanded && renderQuotaTable(group, `card_${cardId}`, { groupType: 'card', cardId })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {paymentGroups.size > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4 text-gray-800">支付方式</h3>
          <div className="space-y-2">
            {Array.from(paymentGroups.entries()).map(([paymentId, group]) => {
              const paymentName = group[0]?.paymentMethodName || group[0]?.name || '未知支付方式';
              const isExpanded = expandedPayments.has(paymentId);
              return (
                <div key={paymentId} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => togglePayment(paymentId)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <span className="font-medium text-gray-900">{paymentName}</span>
                    <span className="text-gray-500">{isExpanded ? '▼' : '▶'}</span>
                  </button>
                  {isExpanded &&
                    renderQuotaTable(group, `payment_${paymentId}`, { groupType: 'payment', paymentId })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

