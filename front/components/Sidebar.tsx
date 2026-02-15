import React from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from '@/constants/theme';
import { ThemedText } from './themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type NavItem = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid-outline', active: true },
  { id: 'route-planner', label: 'Route Planner', icon: 'map-outline' },
  { id: 'stations', label: 'Stations', icon: 'location-outline' },
  { id: 'schedules', label: 'Schedules', icon: 'time-outline' },
  { id: 'analytics', label: 'Analytics', icon: 'stats-chart-outline' },
];

const FOOTER_ITEMS: NavItem[] = [
  { id: 'notifications', label: 'Notifications', icon: 'notifications-outline' },
  { id: 'help', label: 'Help', icon: 'help-circle-outline' },
  { id: 'settings', label: 'Settings', icon: 'settings-outline' },
];

export function Sidebar() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
            <Ionicons name="bus" size={24} color={Colors.dark.primary} />
        </View>
        <View>
            <ThemedText type="defaultSemiBold" style={styles.brandName}>TransitFlow</ThemedText>
            <ThemedText style={styles.tagline}>Smart Routing</ThemedText>
        </View>
      </View>

      <ScrollView style={styles.navSection}>
        <ThemedText style={styles.sectionTitle}>Navigation</ThemedText>
        {NAV_ITEMS.map((item) => (
          <TouchableOpacity 
            key={item.id} 
            style={[styles.navItem, item.active && styles.navItemActive]}
          >
            <Ionicons 
              name={item.icon} 
              size={20} 
              color={item.active ? Colors.dark.primary : Colors.dark.icon} 
            />
            <ThemedText style={[styles.navLabel, item.active && styles.labelActive]}>
              {item.label}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        {FOOTER_ITEMS.map((item) => (
          <TouchableOpacity key={item.id} style={styles.footerItem}>
            <Ionicons name={item.icon} size={20} color={Colors.dark.icon} />
            <ThemedText style={styles.footerLabel}>{item.label}</ThemedText>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 240,
    backgroundColor: Colors.dark.background,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.border,
    height: '100%',
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
    gap: 12,
  },
  logoContainer: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandName: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  tagline: {
    fontSize: 12,
    color: Colors.dark.icon,
  },
  navSection: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: Colors.dark.icon,
    marginBottom: 16,
    letterSpacing: 1,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
    gap: 12,
  },
  navItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  navLabel: {
    fontSize: 14,
    color: Colors.dark.icon,
  },
  labelActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: 20,
    gap: 16,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
  },
  footerLabel: {
    fontSize: 14,
    color: Colors.dark.icon,
  },
});
