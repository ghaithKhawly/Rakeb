import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { ThemedText } from './themed-text';
import { Ionicons } from '@expo/vector-icons';

type FeedItem = {
  id: string;
  line: string;
  status: 'On Time' | 'Delayed' | 'Alert';
  location: string;
  detail: string;
  time: string;
  type: 'bus' | 'train';
};

const FEED_DATA: FeedItem[] = [
  { id: '1', line: 'L2', status: 'On Time', location: 'Central Station', detail: 'Running on schedule', time: '2 min ago', type: 'train' },
  { id: '2', line: 'B7', status: 'Delayed', location: 'Park Avenue', detail: '5 min delay due to traffic', time: '5 min ago', type: 'bus' },
  { id: '3', line: 'L1', status: 'On Time', location: 'University', detail: 'Arriving in 3 minutes', time: '8 min ago', type: 'train' },
  { id: '4', line: 'B12', status: 'Alert', location: 'Harbour Road', detail: 'Route diverted, use alternate', time: '12 min ago', type: 'bus' },
];

export function LiveTransitFeed() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="defaultSemiBold" style={styles.title}>Live Transit Feed</ThemedText>
        <View style={styles.liveIndicator}>
            <View style={styles.dot} />
            <ThemedText style={styles.liveText}>Live</ThemedText>
        </View>
      </View>

      <View style={styles.list}>
        {FEED_DATA.map((item) => (
          <View key={item.id} style={styles.item}>
            <View style={styles.itemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(45, 212, 191, 0.05)' }]}>
                    <Ionicons name={item.type === 'train' ? "subway-outline" : "bus-outline"} size={18} color={item.type === 'train' ? Colors.dark.primary : "#3B82F6"} />
                </View>
                <View style={styles.itemInfo}>
                    <View style={styles.lineRow}>
                        <ThemedText type="defaultSemiBold" style={styles.lineName}>{item.line}</ThemedText>
                        <View style={[styles.statusBadge, item.status === 'Delayed' && styles.delayedBadge, item.status === 'Alert' && styles.alertBadge]}>
                            <Ionicons name={item.status === 'On Time' ? "checkmark-circle" : item.status === 'Delayed' ? "warning" : "alert-circle"} size={10} color={item.status === 'On Time' ? "#10B981" : item.status === 'Delayed' ? "#F59E0B" : "#EF4444"} />
                            <ThemedText style={[styles.statusText, item.status === 'Delayed' && styles.delayedText, item.status === 'Alert' && styles.alertText]}>
                                {item.status}
                            </ThemedText>
                        </View>
                    </View>
                    <ThemedText style={styles.locationDetail}>{item.location} — {item.detail}</ThemedText>
                </View>
            </View>
            <ThemedText style={styles.timeText}>{item.time}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveText: {
    fontSize: 12,
    color: Colors.dark.icon,
  },
  list: {
    gap: 0,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    gap: 4,
    flex: 1,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  lineName: {
    fontSize: 15,
    color: '#FFFFFF',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600',
  },
  delayedBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  delayedText: {
    color: '#F59E0B',
  },
  alertBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  alertText: {
    color: '#EF4444',
  },
  locationDetail: {
    fontSize: 13,
    color: Colors.dark.icon,
  },
  timeText: {
    fontSize: 12,
    color: Colors.dark.icon,
    marginLeft: 8,
  },
});
