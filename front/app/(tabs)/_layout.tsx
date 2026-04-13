import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { Colors } from "@/constants/theme";
import { Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "@/hooks/LanguageContext";

export default function TabLayout() {
  const { t } = useLanguage();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.dark.primary,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: Platform.select({
          web: { display: "none" }, // Hide tabs on web since we have a sidebar
          default: {
            backgroundColor: Colors.dark.background,
            borderTopColor: Colors.dark.border,
          },
        }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.home"),
          tabBarIcon: ({ color }) => (
            <Ionicons size={24} name="home" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("tabs.settings"),
          tabBarIcon: ({ color }) => (
            <Ionicons size={24} name="settings" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
