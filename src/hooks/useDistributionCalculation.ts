import { useMemo } from "react";
import { useAsnafSettings, AsnafSetting } from "./useAsnafSettings";
import { sortMustahikByRoute } from "@/lib/mustahikRoute";

interface Mustahik {
  id: string;
  name: string;
  asnaf_id: string;
  asnaf_settings?: { asnaf_code: string } | null;
  priority: string;
  family_members?: number | null;
  distribution_rt?: string | null;
  distribution_lane?: string | null;
  delivery_order?: number | null;
}

interface FundBalance {
  category: string;
  total_cash: number;
  total_rice_kg: number;
  total_food_kg: number;
}

interface DistributionResult {
  mustahikId: string;
  name: string;
  asnaf: string;
  priority: string;
  cashAmount: number;
  riceAmount: number;
  foodAmount: number;
}

interface CategoryDistribution {
  amil: DistributionResult[];
  beneficiaries: DistributionResult[];
  amilTotal: number;
  beneficiaryTotal: number;
}

export type AmilDistributionMode = "percentage" | "proportional_with_factor";

interface DistributionCalculationOptions {
  amilDistributionMode?: AmilDistributionMode;
  amilShareFactor?: number;
  excludeExistingDistributed?: boolean;
}

// Distribution priority weights
const PRIORITY_WEIGHTS: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function useDistributionCalculation(
  mustahikList: Mustahik[],
  fundBalances: FundBalance[],
  existingDistributions: { mustahik_id: string; fund_category: string; status: string }[],
  options?: DistributionCalculationOptions
) {
  const { asnafSettings } = useAsnafSettings();

  return useMemo(() => {
    // Build eligibility map from settings (by ID for new FK, by code for compatibility)
    const eligibilityMapById = new Map<string, AsnafSetting>();
    const eligibilityMapByCode = new Map<string, AsnafSetting>();
    asnafSettings.forEach(s => {
      eligibilityMapById.set(s.id, s);
      eligibilityMapByCode.set(s.asnaf_code, s);
    });

    // Helper to get asnaf code from mustahik (supports both old and new structure)
    const getAsnafCode = (m: Mustahik): string => {
      return m.asnaf_settings?.asnaf_code || eligibilityMapById.get(m.asnaf_id)?.asnaf_code || "";
    };

    // Get Amil percentage from settings (default 12.5%)
    const amilSetting = asnafSettings.find(s => s.asnaf_code === "amil");
    const AMIL_PERCENTAGE = (amilSetting?.distribution_percentage || 12.5) / 100;
    const amilDistributionMode: AmilDistributionMode = options?.amilDistributionMode || "percentage";
    const amilShareFactor = Math.max(0, Math.min(1, options?.amilShareFactor ?? 0.5));
    const excludeExistingDistributed = options?.excludeExistingDistributed ?? true;

    // Separate Amil from other mustahik
    const amilList = sortMustahikByRoute(mustahikList.filter(m => getAsnafCode(m) === "amil"));
    const beneficiaryList = sortMustahikByRoute(mustahikList.filter(m => getAsnafCode(m) !== "amil"));

    // Filter mustahik based on eligibility for each fund type
    const getEligibleForZakatFitrah = (list: Mustahik[]) => {
      return list.filter(m => {
        const asnafCode = getAsnafCode(m);
        const setting = eligibilityMapByCode.get(asnafCode);
        return setting?.receives_zakat_fitrah ?? true;
      });
    };

    const getEligibleForZakatMal = (list: Mustahik[]) => {
      return list.filter(m => {
        const asnafCode = getAsnafCode(m);
        const setting = eligibilityMapByCode.get(asnafCode);
        return setting?.receives_zakat_mal ?? true;
      });
    };

    const getEligibleForFidyah = (list: Mustahik[]) => {
      return list.filter(m => {
        const asnafCode = getAsnafCode(m);
        const setting = eligibilityMapByCode.get(asnafCode);
        return setting?.receives_fidyah ?? false;
      });
    };

    // Get distributed mustahik IDs per category
    const distributedByCategory: Record<string, Set<string>> = {};
    if (excludeExistingDistributed) {
      existingDistributions
        .filter(d => d.status === "distributed" || d.status === "approved")
        .forEach(d => {
          if (!distributedByCategory[d.fund_category]) {
            distributedByCategory[d.fund_category] = new Set();
          }
          distributedByCategory[d.fund_category].add(d.mustahik_id);
        });
    }

    // Calculate available amounts per category
    const getAvailableBalance = (category: string) => {
      const balance = fundBalances.find(b => b.category === category);
      return balance || { total_cash: 0, total_rice_kg: 0, total_food_kg: 0 };
    };

    const splitAmilAndBeneficiaryPortions = (
      totalAmount: number,
      amilCount: number,
      beneficiaryCount: number,
      scale: number,
    ) => {
      const scaledTotal = Math.max(0, Math.round(totalAmount * scale));
      if (scaledTotal <= 0) {
        return { amilPortion: 0, beneficiaryPortion: 0 };
      }
      if (amilCount === 0) {
        return { amilPortion: 0, beneficiaryPortion: scaledTotal / scale };
      }
      if (beneficiaryCount === 0) {
        return { amilPortion: scaledTotal / scale, beneficiaryPortion: 0 };
      }

      let amilScaled = 0;
      if (amilDistributionMode === "proportional_with_factor") {
        const totalRecipients = amilCount + beneficiaryCount;
        const basePerRecipientScaled = totalRecipients > 0 ? Math.floor(scaledTotal / totalRecipients) : 0;
        const amilPerRecipientScaled = Math.floor(basePerRecipientScaled * amilShareFactor);
        amilScaled = Math.max(0, amilPerRecipientScaled * amilCount);
      } else {
        amilScaled = Math.max(0, Math.floor(scaledTotal * AMIL_PERCENTAGE));
      }

      amilScaled = Math.min(amilScaled, Math.floor(scaledTotal / 2));
      const beneficiaryScaled = Math.max(0, scaledTotal - amilScaled);

      return {
        amilPortion: amilScaled / scale,
        beneficiaryPortion: beneficiaryScaled / scale,
      };
    };

    const calculateAmilAndBeneficiaryPortions = (
      totalAmount: number,
      amilCount: number,
      beneficiaryCount: number
    ) => splitAmilAndBeneficiaryPortions(totalAmount, amilCount, beneficiaryCount, 100);

    const calculateCashAmilAndBeneficiaryPortions = (
      totalAmount: number,
      amilCount: number,
      beneficiaryCount: number
    ) => splitAmilAndBeneficiaryPortions(totalAmount, amilCount, beneficiaryCount, 1);

    // Helper to calculate weighted distribution
    const distributeByWeight = (
      list: Mustahik[],
      totalAmount: number,
      amountType: "cash" | "rice" | "food"
    ): DistributionResult[] => {
      if (list.length === 0 || totalAmount <= 0) return [];

      const scale = amountType === "cash" ? 1 : 100;
      const scaledTotal = Math.max(0, Math.round(totalAmount * scale));
      if (scaledTotal <= 0) return [];

      const totalWeight = list.reduce(
        (sum, b) => sum + (PRIORITY_WEIGHTS[b.priority] || 1) * (b.family_members || 1),
        0
      );

      const weightedShares = list.map((b, idx) => {
        const weight = (PRIORITY_WEIGHTS[b.priority] || 1) * (b.family_members || 1);
        const rawScaledShare = totalWeight > 0 ? (weight / totalWeight) * scaledTotal : 0;
        const floored = Math.floor(rawScaledShare);
        return {
          idx,
          item: b,
          floored,
          fractional: rawScaledShare - floored,
          weight,
        };
      });

      const remainder = scaledTotal - weightedShares.reduce((sum, current) => sum + current.floored, 0);
      weightedShares
        .sort((a, b) => {
          if (b.fractional !== a.fractional) return b.fractional - a.fractional;
          return b.weight - a.weight;
        })
        .forEach((entry, idx) => {
          if (idx < remainder) entry.floored += 1;
        });

      return weightedShares
        .sort((a, b) => a.idx - b.idx)
        .map(({ item, floored }) => {
        const normalizedShare = floored / scale;
        return {
          mustahikId: item.id,
          name: item.name,
          asnaf: getAsnafCode(item),
          priority: item.priority,
          cashAmount: amountType === "cash" ? normalizedShare : 0,
          riceAmount: amountType === "rice" ? normalizedShare : 0,
          foodAmount: amountType === "food" ? normalizedShare : 0,
        };
        });
    };

    const distributeEqually = (
      list: Mustahik[],
      totalAmount: number,
      amountType: "cash" | "rice" | "food"
    ): DistributionResult[] => {
      if (list.length === 0 || totalAmount <= 0) return [];

      if (amountType === "cash") {
        const roundedTotal = Math.max(0, Math.round(totalAmount));
        const count = list.length;
        const base = Math.floor(roundedTotal / count);
        const remainder = roundedTotal - base * count;
        return list.map((b, idx) => ({
          mustahikId: b.id,
          name: b.name,
          asnaf: getAsnafCode(b),
          priority: b.priority,
          cashAmount: base + (idx < remainder ? 1 : 0),
          riceAmount: 0,
          foodAmount: 0,
        }));
      }

      const count = list.length;
      const evenAmount = Number((totalAmount / count).toFixed(2));
      return list.map((b, idx) => {
        const nonFinalTotal = evenAmount * (count - 1);
        const finalAmount = Number((totalAmount - nonFinalTotal).toFixed(2));
        const share = idx === count - 1 ? finalAmount : evenAmount;
        return {
          mustahikId: b.id,
          name: b.name,
          asnaf: getAsnafCode(b),
          priority: b.priority,
          cashAmount: 0,
          riceAmount: amountType === "rice" ? share : 0,
          foodAmount: amountType === "food" ? share : 0,
        };
      });
    };

    // Calculate distribution for zakat fitrah (cash)
    const calculateZakatFitrahCash = (): CategoryDistribution => {
      const balance = getAvailableBalance("zakat_fitrah_cash");
      const totalCash = balance.total_cash;
      const distributed = distributedByCategory["zakat_fitrah_cash"] || new Set();
      
      // Filter by eligibility AND not already distributed
      const eligibleAmil = getEligibleForZakatFitrah(amilList).filter(a => !distributed.has(a.id));
      const eligibleBeneficiaries = getEligibleForZakatFitrah(beneficiaryList).filter(b => !distributed.has(b.id));
      
      if (totalCash <= 0 || (eligibleAmil.length === 0 && eligibleBeneficiaries.length === 0)) {
        return { amil: [], beneficiaries: [], amilTotal: 0, beneficiaryTotal: 0 };
      }

      const { amilPortion, beneficiaryPortion } = calculateCashAmilAndBeneficiaryPortions(
        totalCash,
        eligibleAmil.length,
        eligibleBeneficiaries.length
      );

      const amilDistribution = distributeEqually(eligibleAmil, amilPortion, "cash");

      const beneficiaryDistribution =
        amilDistributionMode === "proportional_with_factor"
          ? distributeEqually(eligibleBeneficiaries, beneficiaryPortion, "cash")
          : distributeByWeight(eligibleBeneficiaries, beneficiaryPortion, "cash");

      return {
        amil: amilDistribution,
        beneficiaries: beneficiaryDistribution,
        amilTotal: amilPortion,
        beneficiaryTotal: beneficiaryPortion,
      };
    };

    // Calculate distribution for zakat fitrah (rice)
    const calculateZakatFitrahRice = (): CategoryDistribution => {
      const balance = getAvailableBalance("zakat_fitrah_rice");
      const totalRice = balance.total_rice_kg;
      const distributed = distributedByCategory["zakat_fitrah_rice"] || new Set();
      
      const eligibleAmil = getEligibleForZakatFitrah(amilList).filter(a => !distributed.has(a.id));
      const eligibleBeneficiaries = getEligibleForZakatFitrah(beneficiaryList).filter(b => !distributed.has(b.id));
      
      if (totalRice <= 0 || (eligibleAmil.length === 0 && eligibleBeneficiaries.length === 0)) {
        return { amil: [], beneficiaries: [], amilTotal: 0, beneficiaryTotal: 0 };
      }

      const { amilPortion, beneficiaryPortion } = calculateAmilAndBeneficiaryPortions(
        totalRice,
        eligibleAmil.length,
        eligibleBeneficiaries.length
      );

      const amilDistribution = distributeEqually(eligibleAmil, amilPortion, "rice");

      const beneficiaryDistribution =
        amilDistributionMode === "proportional_with_factor"
          ? distributeEqually(eligibleBeneficiaries, beneficiaryPortion, "rice")
          : distributeByWeight(eligibleBeneficiaries, beneficiaryPortion, "rice");

      return {
        amil: amilDistribution,
        beneficiaries: beneficiaryDistribution,
        amilTotal: amilPortion,
        beneficiaryTotal: beneficiaryPortion,
      };
    };

    // Calculate distribution for zakat mal
    const calculateZakatMal = (): CategoryDistribution => {
      const balance = getAvailableBalance("zakat_mal");
      const totalCash = balance.total_cash;
      const distributed = distributedByCategory["zakat_mal"] || new Set();
      
      const eligibleAmil = getEligibleForZakatMal(amilList).filter(a => !distributed.has(a.id));
      const eligibleBeneficiaries = getEligibleForZakatMal(beneficiaryList).filter(b => !distributed.has(b.id));
      
      if (totalCash <= 0 || (eligibleAmil.length === 0 && eligibleBeneficiaries.length === 0)) {
        return { amil: [], beneficiaries: [], amilTotal: 0, beneficiaryTotal: 0 };
      }

      const { amilPortion, beneficiaryPortion } = calculateCashAmilAndBeneficiaryPortions(
        totalCash,
        eligibleAmil.length,
        eligibleBeneficiaries.length
      );

      const amilDistribution = distributeEqually(eligibleAmil, amilPortion, "cash");

      const beneficiaryDistribution =
        amilDistributionMode === "proportional_with_factor"
          ? distributeEqually(eligibleBeneficiaries, beneficiaryPortion, "cash")
          : distributeByWeight(eligibleBeneficiaries, beneficiaryPortion, "cash");

      return {
        amil: amilDistribution,
        beneficiaries: beneficiaryDistribution,
        amilTotal: amilPortion,
        beneficiaryTotal: beneficiaryPortion,
      };
    };

    // Calculate distribution for fidyah (cash) - only to eligible asnaf
    const calculateFidyahCash = (): CategoryDistribution => {
      const balance = getAvailableBalance("fidyah_cash");
      const totalCash = balance.total_cash;
      const distributed = distributedByCategory["fidyah_cash"] || new Set();
      
      // Fidyah only goes to eligible beneficiaries (based on asnaf settings), NO amil
      const eligibleBeneficiaries = getEligibleForFidyah(beneficiaryList).filter(b => !distributed.has(b.id));
      
      if (totalCash <= 0 || eligibleBeneficiaries.length === 0) {
        return { amil: [], beneficiaries: [], amilTotal: 0, beneficiaryTotal: 0 };
      }

      const beneficiaryDistribution = distributeByWeight(eligibleBeneficiaries, totalCash, "cash");

      return {
        amil: [],
        beneficiaries: beneficiaryDistribution,
        amilTotal: 0,
        beneficiaryTotal: totalCash,
      };
    };

    // Calculate distribution for fidyah (food)
    const calculateFidyahFood = (): CategoryDistribution => {
      const balance = getAvailableBalance("fidyah_food");
      const totalFood = balance.total_food_kg;
      const distributed = distributedByCategory["fidyah_food"] || new Set();
      
      const eligibleBeneficiaries = getEligibleForFidyah(beneficiaryList).filter(b => !distributed.has(b.id));
      
      if (totalFood <= 0 || eligibleBeneficiaries.length === 0) {
        return { amil: [], beneficiaries: [], amilTotal: 0, beneficiaryTotal: 0 };
      }

      const beneficiaryDistribution = distributeByWeight(eligibleBeneficiaries, totalFood, "food");

      return {
        amil: [],
        beneficiaries: beneficiaryDistribution,
        amilTotal: 0,
        beneficiaryTotal: totalFood,
      };
    };

    return {
      zakatFitrahCash: calculateZakatFitrahCash(),
      zakatFitrahRice: calculateZakatFitrahRice(),
      zakatMal: calculateZakatMal(),
      fidyahCash: calculateFidyahCash(),
      fidyahFood: calculateFidyahFood(),
      amilList,
      beneficiaryList,
      asnafSettings,
      eligibilityMap: eligibilityMapByCode,
      configuration: {
        amilDistributionMode,
        amilShareFactor,
        amilPercentage: AMIL_PERCENTAGE,
        excludeExistingDistributed,
      },
    };
  }, [
    mustahikList,
    fundBalances,
    existingDistributions,
    asnafSettings,
    options?.amilDistributionMode,
    options?.amilShareFactor,
    options?.excludeExistingDistributed,
  ]);
}
