import { useMemo } from "react";
import { useAsnafSettings, AsnafSetting } from "./useAsnafSettings";

interface Mustahik {
  id: string;
  name: string;
  asnaf_id: string;
  asnaf_settings?: { asnaf_code: string } | null;
  priority: string;
  family_members?: number | null;
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

    // Separate Amil from other mustahik
    const amilList = mustahikList.filter(m => getAsnafCode(m) === "amil");
    const beneficiaryList = mustahikList.filter(m => getAsnafCode(m) !== "amil");

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
    existingDistributions
      .filter(d => d.status === "distributed" || d.status === "approved")
      .forEach(d => {
        if (!distributedByCategory[d.fund_category]) {
          distributedByCategory[d.fund_category] = new Set();
        }
        distributedByCategory[d.fund_category].add(d.mustahik_id);
      });

    // Calculate available amounts per category
    const getAvailableBalance = (category: string) => {
      const balance = fundBalances.find(b => b.category === category);
      return balance || { total_cash: 0, total_rice_kg: 0, total_food_kg: 0 };
    };

    const calculateAmilAndBeneficiaryPortions = (
      totalAmount: number,
      amilCount: number,
      beneficiaryCount: number
    ) => {
      if (totalAmount <= 0) {
        return { amilPortion: 0, beneficiaryPortion: 0 };
      }
      if (amilCount === 0) {
        return { amilPortion: 0, beneficiaryPortion: totalAmount };
      }
      if (beneficiaryCount === 0) {
        return { amilPortion: totalAmount, beneficiaryPortion: 0 };
      }

      if (amilDistributionMode === "proportional_with_factor") {
        const proportionalPortion = totalAmount * (amilCount / (amilCount + beneficiaryCount));
        const amilPortion = proportionalPortion * amilShareFactor;
        return {
          amilPortion,
          beneficiaryPortion: totalAmount - amilPortion,
        };
      }

      const amilPortion = totalAmount * AMIL_PERCENTAGE;
      return {
        amilPortion,
        beneficiaryPortion: totalAmount - amilPortion,
      };
    };

    // Helper to calculate weighted distribution
    const distributeByWeight = (
      list: Mustahik[],
      totalAmount: number,
      amountType: "cash" | "rice" | "food"
    ): DistributionResult[] => {
      if (list.length === 0 || totalAmount <= 0) return [];

      const totalWeight = list.reduce(
        (sum, b) => sum + (PRIORITY_WEIGHTS[b.priority] || 1) * (b.family_members || 1),
        0
      );

      return list.map(b => {
        const weight = (PRIORITY_WEIGHTS[b.priority] || 1) * (b.family_members || 1);
        const share = totalWeight > 0 ? (weight / totalWeight) * totalAmount : 0;
        return {
          mustahikId: b.id,
          name: b.name,
          asnaf: getAsnafCode(b),
          priority: b.priority,
          cashAmount: amountType === "cash" ? Math.floor(share) : 0,
          riceAmount: amountType === "rice" ? Number(share.toFixed(2)) : 0,
          foodAmount: amountType === "food" ? Number(share.toFixed(2)) : 0,
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
        const count = list.length;
        const base = Math.floor(totalAmount / count);
        const remainder = Math.max(0, Math.round(totalAmount - base * count));
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

      const { amilPortion, beneficiaryPortion } = calculateAmilAndBeneficiaryPortions(
        totalCash,
        eligibleAmil.length,
        eligibleBeneficiaries.length
      );

      // Distribute to Amil equally
      const amilAmount = eligibleAmil.length > 0 ? amilPortion / eligibleAmil.length : 0;
      const amilDistribution = eligibleAmil.map(a => ({
        mustahikId: a.id,
        name: a.name,
        asnaf: getAsnafCode(a),
        priority: a.priority,
        cashAmount: Math.floor(amilAmount),
        riceAmount: 0,
        foodAmount: 0,
      }));

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

      const amilAmount = eligibleAmil.length > 0 ? amilPortion / eligibleAmil.length : 0;
      const amilDistribution = eligibleAmil.map(a => ({
        mustahikId: a.id,
        name: a.name,
        asnaf: getAsnafCode(a),
        priority: a.priority,
        cashAmount: 0,
        riceAmount: Number(amilAmount.toFixed(2)),
        foodAmount: 0,
      }));

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

      const { amilPortion, beneficiaryPortion } = calculateAmilAndBeneficiaryPortions(
        totalCash,
        eligibleAmil.length,
        eligibleBeneficiaries.length
      );

      const amilAmount = eligibleAmil.length > 0 ? amilPortion / eligibleAmil.length : 0;
      const amilDistribution = eligibleAmil.map(a => ({
        mustahikId: a.id,
        name: a.name,
        asnaf: getAsnafCode(a),
        priority: a.priority,
        cashAmount: Math.floor(amilAmount),
        riceAmount: 0,
        foodAmount: 0,
      }));

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
      },
    };
  }, [mustahikList, fundBalances, existingDistributions, asnafSettings, options?.amilDistributionMode, options?.amilShareFactor]);
}
