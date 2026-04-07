import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Kinetic } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/hooks/AuthContext";

function SettingsCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={styles.cardLeft}>
        <View style={styles.cardIconWrap}>
          <Ionicons name={icon} size={24} color={Kinetic.primary} />
        </View>
        <View style={styles.cardCopy}>
          <ThemedText style={styles.cardTitle}>{title}</ThemedText>
          <ThemedText style={styles.cardSubtitle}>{subtitle}</ThemedText>
        </View>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={Kinetic.onSurfaceVariant}
      />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 12) + 12,
            paddingBottom: Math.max(insets.bottom, 20) + 96,
          },
        ]}
      >
        <View style={styles.hero}>
          <ThemedText style={styles.heroTitle}>Settings</ThemedText>
          <ThemedText style={styles.heroSubtitle}>
            Customize your movement through the city.
          </ThemedText>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Ionicons name="person" size={24} color={Kinetic.primary} />
          </View>
          <View>
            <ThemedText style={styles.profileName}>
              {user?.username ?? "User"}
            </ThemedText>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionLabel}>Transportation</ThemedText>
          <SettingsCard
            icon="map"
            title="Routes Map"
            subtitle="View and toggle active bus lines"
            onPress={() => router.push("/(settings)/routes")}
          />
          <SettingsCard
            icon="options"
            title="Preferences"
            subtitle="Customize routing factors"
            onPress={() => router.push("/(settings)/preferences" as never)}
          />
        </View>

        <TouchableOpacity
          style={styles.signOutButton}
          activeOpacity={0.85}
          onPress={() => {
            void signOut();
          }}
        >
          <Ionicons name="log-out-outline" size={20} color="#BA1A1A" />
          <ThemedText style={styles.signOutText}>Sign Out</ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Kinetic.surfaceLow,
  },
  content: {
    paddingHorizontal: 24,
    gap: 18,
  },
  hero: {
    gap: 2,
    marginBottom: 8,
    paddingVertical: 2,
  },
  heroTitle: {
    color: Kinetic.onSurface,
    fontWeight: "900",
    fontSize: 42,
    lineHeight: 50,
    letterSpacing: -1,
  },
  heroSubtitle: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 15,
    fontWeight: "500",
  },
  profileCard: {
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#dde1ff",
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    color: Kinetic.onSurface,
    fontSize: 19,
    fontWeight: "800",
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    color: Kinetic.onSurfaceVariant,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 4,
  },
  card: {
    borderRadius: 22,
    backgroundColor: Kinetic.surfaceContainer,
    minHeight: 92,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardLeft: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    flex: 1,
  },
  cardIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#dde1ff",
    alignItems: "center",
    justifyContent: "center",
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Kinetic.onSurface,
  },
  cardSubtitle: {
    fontSize: 13,
    color: Kinetic.onSurfaceVariant,
    marginTop: 2,
  },
  signOutButton: {
    height: 58,
    borderRadius: 18,
    backgroundColor: "#ffeceb",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  signOutText: {
    color: "#BA1A1A",
    fontWeight: "800",
    fontSize: 16,
  },
});
