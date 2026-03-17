import React from 'react';
import { View, StyleSheet, ScrollView, Platform, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { Colors } from '@/constants/theme';
import { Sidebar } from '@/components/Sidebar';
import { DashboardHeader } from '@/components/DashboardHeader';
import { StatCard } from '@/components/StatCard';
import { RoutePlannerWidget } from '@/components/RoutePlannerWidget';
import { ThemedText } from '@/components/themed-text';
import { CollapsibleMapWidget } from '@/components/CollapsibleMapWidget';

export default function HomeScreen() {
  const isWeb = Platform.OS === 'web';

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
        <View style={styles.container}>
          {isWeb && <Sidebar />}
          
          <View style={styles.mainContent}>
            <DashboardHeader />
            
            <ScrollView 
              style={styles.scrollContent} 
              contentContainerStyle={styles.scrollInner}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.heroSection}>
                <ThemedText type="title" style={styles.pageTitle}>Dashboard</ThemedText>
                <ThemedText style={styles.pageSubtitle}>
                  Real-time overview of your transit network performance and routing analytics.
                </ThemedText>
              </View>

              <View style={styles.statsRow}>
                <StatCard 
                  title="Routes Optimized" 
                  value="1,284" 
                  change="+12.5%" 
                  isPositive={true} 
                  icon="git-branch-outline" 
                />
                <StatCard 
                  title="Active Stations" 
                  value="342" 
                  change="+3.2%" 
                  isPositive={true} 
                  icon="location-outline" 
                />
                <StatCard 
                  title="Avg. Travel Time" 
                  value="24 min" 
                  change="-8.1%" 
                  isPositive={true} 
                  icon="time-outline" 
                />
                <StatCard 
                  title="Efficiency Score" 
                  value="94.2%" 
                  change="+2.4%" 
                  isPositive={true} 
                  icon="speedometer-outline" 
                />
              </View>

              <View style={styles.dashboardGrid}>
                <View style={styles.leftColumn}>
                    <CollapsibleMapWidget />
                </View>

                <View style={styles.rightColumn}>
                    <RoutePlannerWidget />
                    
                    <View style={styles.infoCard}>
                        <ThemedText type="defaultSemiBold" style={styles.infoTitle}>Quick Insights</ThemedText>
                        <ThemedText style={styles.infoText}>
                            System performance is currently 4% above average for this time of day.
                        </ThemedText>
                    </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
    </KeyboardAvoidingView>

  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.dark.background,
  },
  mainContent: {
    flex: 1,
    height: '100%',
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: 24,
    gap: 32,
    paddingBottom: 40,
  },
  heroSection: {
    gap: 8,
  },
  pageTitle: {
    color: '#FFFFFF',
    fontSize: 28,
  },
  pageSubtitle: {
    color: Colors.dark.icon,
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  dashboardGrid: {
    flexDirection: Platform.select({ web: 'row', default: 'column' }),
    gap: 24,
  },
  leftColumn: {
    flex: 2,
    gap: 24,
  },
  rightColumn: {
    flex: 1,
    gap: 24,
  },
  chartPlaceholder: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    height: 300,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  legendWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendItem: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: Colors.dark.icon,
  },
  chartVisual: {
    flex: 1,
    position: 'relative',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  chartGridLine: {
    height: 1,
    backgroundColor: Colors.dark.border,
    width: '100%',
    borderStyle: 'dashed',
  },
  waveContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartLine: {
    width: '100%',
    height: 2,
    backgroundColor: Colors.dark.primary,
    opacity: 0.6,
  },
  chartPoint: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.dark.primary,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
    marginTop: -7, // Half of height + half of line height
  },
  infoCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.1)',
  },
  infoTitle: {
    color: '#3B82F6',
    fontSize: 14,
    marginBottom: 4,
  },
  infoText: {
    color: Colors.dark.icon,
    fontSize: 13,
    lineHeight: 18,
  },
});

