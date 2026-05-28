import React, { useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

import { Kinetic, TransitTheme } from '@/constants/theme';
import { useRoutePlanning } from '@/hooks/RoutePlanningContext';
import { goHome } from '@/utils/navigation';
import { HintBanner } from '@/components/ui/HintBanner';

type FilterBy = 'best' | 'fewest' | 'less-walk' | 'wheelchair';

type RouteCandidate = {
  etaSeconds: number;
  transferCount: number;
  walkingDistanceM: number;
  bestEffort: boolean;
  segments?: Array<{ mode: string; routeId: number | null }>;
};

type RankedRouteCandidate = RouteCandidate & {
  originalIndex: number;
};

function getCandidateTransferCount(route: RouteCandidate): number {
  let transferCount = 0;
  let previousBusRouteId: number | null = null;

  for (const segment of route.segments ?? []) {
    if (segment.mode !== 'bus' || typeof segment.routeId !== 'number') {
      continue;
    }

    if (previousBusRouteId !== null && previousBusRouteId !== segment.routeId) {
      transferCount += 1;
    }

    previousBusRouteId = segment.routeId;
  }

  return transferCount;
}

const FILTER_OPTIONS: Array<{ key: FilterBy; label: string; helper?: string }> = [
  { key: 'best', label: 'Best route' },
  { key: 'fewest', label: 'Fewer transfers', helper: 'Pick the route with the fewest transfers' },
  { key: 'less-walk', label: 'Less walking', helper: 'Prefer the route with the shortest walking distance' },
  { key: 'wheelchair', label: 'Wheelchair accessible', helper: 'Prefer the best-effort accessible option' },
];

function RadioRow({
  label,
  helper,
  active,
  onSelect,
}: {
  label: string;
  helper?: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <TouchableOpacity onPress={onSelect} style={styles.radioRow} activeOpacity={0.82}>
      <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
        {active ? <View style={styles.radioInner} /> : null}
      </View>
      <View style={styles.radioTextWrap}>
        <Text style={styles.radioLabel}>{label}</Text>
        {helper ? <Text style={styles.radioHelper}>{helper}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

function compareRankedCandidates(
  left: RankedRouteCandidate,
  right: RankedRouteCandidate,
  filterBy: FilterBy,
): number {
  if (filterBy === 'best') {
    return left.originalIndex - right.originalIndex;
  }

  const leftTransfers = getCandidateTransferCount(left);
  const rightTransfers = getCandidateTransferCount(right);

  if (filterBy === 'fewest') {
    return leftTransfers - rightTransfers
      || left.transferCount - right.transferCount
      || left.walkingDistanceM - right.walkingDistanceM
      || left.originalIndex - right.originalIndex;
  }

  if (filterBy === 'less-walk') {
    return left.walkingDistanceM - right.walkingDistanceM
      || left.etaSeconds - right.etaSeconds
      || leftTransfers - rightTransfers
      || left.originalIndex - right.originalIndex;
  }

  return (Number(right.bestEffort) - Number(left.bestEffort))
    || left.etaSeconds - right.etaSeconds
    || leftTransfers - rightTransfers
    || left.walkingDistanceM - right.walkingDistanceM
    || left.originalIndex - right.originalIndex;
}

export default function TripOptionsScreen() {
  const params = useLocalSearchParams<{ filterBy?: string; mode?: string }>();
  const { routeOptions, setSelectedRouteIndex } = useRoutePlanning();
  const [filterBy, setFilterBy] = useState<FilterBy>((params.filterBy as FilterBy) ?? 'best');

  const rankedOptions = useMemo(() => {
    return routeOptions
      .map((option, originalIndex) => ({ ...option, originalIndex }))
      .sort((left, right) => compareRankedCandidates(left, right, filterBy));
  }, [filterBy, routeOptions]);

  const activeRouteSummary = useMemo(() => {
    if (rankedOptions.length === 0) {
      return 'Choose a destination and origin first.';
    }

    const selected = rankedOptions[0];
    const transferCount = getCandidateTransferCount(selected);
    return `${Math.max(1, Math.round(selected.etaSeconds / 60))} min • ${transferCount} transfers • ${Math.round(selected.walkingDistanceM)}m walk`;
  }, [rankedOptions]);

  const handleApply = () => {
    if (rankedOptions.length > 0) {
      setSelectedRouteIndex(rankedOptions[0].originalIndex);
    }
    goHome(router);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.iconBtnRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.82}>
            <Feather name="arrow-left" size={20} color={Kinetic.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => goHome(router)} style={styles.iconBtn} activeOpacity={0.82}>
            <Feather name="home" size={20} color={Kinetic.onSurface} />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>Trip options</Text>
        <View style={styles.iconBtnPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <HintBanner
          title="Quick tip"
          message="Choose one filter and tap Apply filter. The selected route is updated immediately on the map."
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active route</Text>
          <Text style={styles.sectionSubtitle}>{activeRouteSummary}</Text>
          {rankedOptions.length > 0 ? (
            <Text style={styles.sectionHint}>
              Top pick: {Math.max(1, Math.round(rankedOptions[0].etaSeconds / 60))} min, {getCandidateTransferCount(rankedOptions[0])} transfers
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Filter by</Text>
          {FILTER_OPTIONS.map((option) => (
            <RadioRow
              key={option.key}
              label={option.label}
              helper={option.helper}
              active={filterBy === option.key}
              onSelect={() => setFilterBy(option.key)}
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.applyBtn} onPress={handleApply} activeOpacity={0.85}>
          <Text style={styles.applyBtnText}>Apply filter</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Kinetic.surfaceLow,
  },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: TransitTheme.panel.border,
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 20,
    color: Kinetic.onSurface,
    fontWeight: '700',
  },
  iconBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
  },
  iconBtnPlaceholder: {
    width: 32,
    height: 32,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 120,
    gap: 12,
  },
  section: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  sectionTitle: {
    color: Kinetic.onSurface,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 13,
  },
  sectionHint: {
    color: Kinetic.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  radioRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: TransitTheme.panel.border,
  },
  radioOuter: {
    marginTop: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: TransitTheme.panel.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: Kinetic.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Kinetic.primary,
  },
  radioTextWrap: {
    flex: 1,
    paddingBottom: 10,
  },
  radioLabel: {
    color: Kinetic.onSurface,
    fontSize: 16,
    fontWeight: '500',
  },
  radioHelper: {
    marginTop: 2,
    color: Kinetic.onSurfaceVariant,
    fontSize: 12,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: TransitTheme.panel.border,
    backgroundColor: '#FFFFFF',
  },
  applyBtn: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: Kinetic.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
