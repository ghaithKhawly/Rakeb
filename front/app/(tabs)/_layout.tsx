import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';


export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.dark.primary,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: Platform.select({
          web: { display: 'none' }, // Hide tabs on web since we have a sidebar
          default: { backgroundColor: Colors.dark.background, borderTopColor: Colors.dark.border }
        })
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Ionicons size={24} name="grid" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Route Planner',
          tabBarIcon: ({ color }) => <Ionicons size={24} name="map" color={color} />,
        }}
      />
    </Tabs>

  );
}
