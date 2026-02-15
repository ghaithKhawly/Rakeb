import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { ThemedText } from './themed-text';
import { Ionicons } from '@expo/vector-icons';

type StatCardProps = {
  title: string;
  value: string;
  change: string;
  isPositive: boolean;
  icon: keyof typeof Ionicons.glyphMap;
};

export function StatCard({ title, value, change, isPositive, icon }: StatCardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>{title}</ThemedText>
        <View style={styles.iconContainer}>
            <Ionicons name={icon} size={16} color={Colors.dark.primary} />
        </View>
      </View>
      
      <View style={styles.content}>
        <ThemedText type="title" style={styles.value}>{value}</ThemedText>
        <View style={styles.changeContainer}>
            <Ionicons 
                name={isPositive ? "trending-up" : "trending-down"} 
                size={14} 
                color={isPositive ? "#10B981" : "#EF4444"} 
            />
            <ThemedText style={[styles.changeText, { color: isPositive ? "#10B981" : "#EF4444" }]}>
                {change}
            </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    minWidth: 160,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 12,
    color: Colors.dark.icon,
    fontWeight: '500',
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    gap: 4,
  },
  value: {
    fontSize: 24,
    color: '#FFFFFF',
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
